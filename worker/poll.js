import mongoose from "mongoose";
import { connect as natsConnect, StringCodec } from "nats";
import fetch from "node-fetch";

const { MONGO_URI, NATS_URL } = process.env;

await mongoose.connect(MONGO_URI);

const Service = mongoose.model("Service", new mongoose.Schema({
  name: String,
  url: String,
  status: String,
  alert_webhook: String,
  last_checked: String,
}));

const Event = mongoose.model("Event", new mongoose.Schema({
  service_id: String,
  service_name: String,
  url: String,
  ts: String,
  status: String,
  status_code: Number,
  latency_ms: Number,
  error: String,
}));

const Alert = mongoose.model("Alert", new mongoose.Schema({
  service_id: String,
  service_name: String,
  status: String,
  latency_ms: Number,
  error: String,
}, { timestamps: true }));

const nc  = await natsConnect({ servers: NATS_URL });
const sc  = StringCodec();
const js  = nc.jetstream();
const jsm = await nc.jetstreamManager();

try {
  await jsm.streams.add({ name: "WATCHTOWER", subjects: ["watchtower.events.*"] });
} catch {}

async function checkService(svc) {
  const svcId = svc._id.toString();
  const start = Date.now();
  let status  = "down";
  let code    = null;
  let error   = null;

  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 10_000);
    const resp       = await fetch(svc.url, { signal: controller.signal });
    clearTimeout(timer);
    code   = resp.status;
    status = code >= 200 && code < 400 ? "up" : "down";
  } catch (e) {
    error = e.name === "AbortError" ? "timeout after 10s" : e.message.slice(0, 80);
  }

  const latency_ms = Date.now() - start;
  if (status === "up" && latency_ms > 2000) status = "degraded";

  const ts    = new Date().toISOString();
  const event = {
    service_id: svcId,
    service_name: svc.name,
    url: svc.url,
    ts,
    status,
    status_code: code,
    latency_ms,
    error,
  };

  await Event.create(event);
  await Service.updateOne({ _id: svc._id }, { $set: { status, last_checked: ts } });

  try {
    await js.publish(`watchtower.events.${svcId}`, sc.encode(JSON.stringify(event)));
  } catch (e) {
    console.error(`[nats] publish failed for ${svc.name}:`, e.message);
  }

  if ((status === "down" || status === "degraded") && svc.alert_webhook) {
    try {
      await fetch(svc.alert_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `WatchTower ALERT: *${svc.name}* is ${status.toUpperCase()}`,
          service: svc.name,
          url: svc.url,
          status,
          latency_ms,
          error,
          ts,
        }),
      });
    } catch {}
    await Alert.create({ service_id: svcId, service_name: svc.name, status, latency_ms, error });
  }

  const icon = { up: "✅", down: "❌", degraded: "▲" }[status] ?? "?";
  console.log(`${icon}  ${svc.name.padEnd(30)} ${status.padEnd(10)} ${String(latency_ms).padStart(6)}ms`);
}

console.log(`[poll] ${new Date().toISOString()}`);

const services = await Service.find().lean();
if (!services.length) {
  console.log("[poll] no services registered yet");
  await nc.close();
  await mongoose.connection.close();
  process.exit(0);
}

console.log(`[poll] checking ${services.length} service(s)`);
const results = await Promise.allSettled(services.map(checkService));
const failed  = results.filter(r => r.status === "rejected");
if (failed.length) failed.forEach(r => console.error("[poll] error:", r.reason));
console.log(`[poll] done — ${services.length - failed.length} ok, ${failed.length} failed`);

await nc.close();
await mongoose.connection.close();
process.exit(0);
