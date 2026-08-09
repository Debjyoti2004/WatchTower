import pg from "pg";
import { connect as natsConnect, StringCodec } from "nats";
import { checkService } from "./check.js";

const { Pool } = pg;
const { DATABASE_URL, NATS_URL } = process.env;

const pool = new Pool({ connectionString: DATABASE_URL });
const nc   = await natsConnect({ servers: NATS_URL });
const sc   = StringCodec();
const js   = nc.jetstream();
const jsm  = await nc.jetstreamManager();

try {
  await jsm.streams.add({ name: "WATCHTOWER", subjects: ["watchtower.events.*"] });
} catch {}

console.log(`[poll] ${new Date().toISOString()}`);

const { rows: services } = await pool.query("SELECT * FROM services");
if (!services.length) {
  console.log("[poll] no services registered yet");
  await nc.close();
  await pool.end();
  process.exit(0);
}

console.log(`[poll] checking ${services.length} service(s)`);
const results = await Promise.allSettled(services.map(svc => checkService(svc, { pool, js, sc })));
const failed  = results.filter(r => r.status === "rejected");
if (failed.length) failed.forEach(r => console.error("[poll] error:", r.reason));
console.log(`[poll] done — ${services.length - failed.length} ok, ${failed.length} failed`);

await nc.close();
await pool.end();
process.exit(0);
