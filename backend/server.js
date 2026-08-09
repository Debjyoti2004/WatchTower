import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import mongoose from "mongoose";
import Redis from "ioredis";
import { connect as natsConnect, StringCodec } from "nats";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import PDFDocument from "pdfkit";
import fetch from "node-fetch";

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const {
  MONGO_URI, VALKEY_HOST, VALKEY_PORT = "6379",
  NATS_URL, S3_ENDPOINT, S3_KEY, S3_SECRET, S3_BUCKET,
  PORT = "8000",
} = process.env;

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({ model: "gemini-2.0-flash" });
const redis = new Redis({ host: VALKEY_HOST, port: Number(VALKEY_PORT) });
const s3    = new S3Client({
  endpoint: S3_ENDPOINT,
  region: "us-east-1",
  credentials: { accessKeyId: S3_KEY, secretAccessKey: S3_SECRET },
  forcePathStyle: true,
});

await mongoose.connect(MONGO_URI);
console.log("[mongo] connected");

const serviceSchema = new mongoose.Schema({
  name: String,
  url: String,
  interval_seconds: { type: Number, default: 30 },
  alert_webhook: String,
  alert_email: String,
  status: { type: String, default: "pending" },
  last_checked: String,
  _demo: { type: Boolean, default: false },
}, { timestamps: true });

const eventSchema = new mongoose.Schema({
  service_id: String,
  service_name: String,
  url: String,
  ts: String,
  status: String,
  status_code: Number,
  latency_ms: Number,
  error: String,
});
eventSchema.index({ service_id: 1, ts: -1 });

const analysisSchema = new mongoose.Schema({
  service_id: String,
  service_name: String,
  analysis: String,
  event_count: Number,
}, { timestamps: true });

const alertSchema = new mongoose.Schema({
  service_id: String,
  service_name: String,
  status: String,
  latency_ms: Number,
  error: String,
}, { timestamps: true });

const reportSchema = new mongoose.Schema({
  service_id: String,
  service_name: String,
  url: String,
  filename: String,
}, { timestamps: true });

serviceSchema.index({ status: 1 });

const Service  = mongoose.model("Service",  serviceSchema);
const Event    = mongoose.model("Event",    eventSchema);
const Analysis = mongoose.model("Analysis", analysisSchema);
const Alert    = mongoose.model("Alert",    alertSchema);
const Report   = mongoose.model("Report",   reportSchema);

// seed 4 demo services on first boot so the dashboard has data immediately
const seedServices = [
  { name: "Healthy service",         url: "https://httpbin.org/status/200", _demo: true },
  { name: "Degraded service (slow)", url: "https://httpbin.org/delay/3",    _demo: true },
  { name: "Broken service (500)",    url: "https://httpbin.org/status/500", _demo: true },
  { name: "WatchTower itself",       url: `http://backend:${PORT}/health`,  _demo: true },
];

const existingCount = await Service.countDocuments();
if (existingCount === 0) {
  await Service.insertMany(seedServices);
  console.log("[startup] seeded 4 demo services");
} else {
  console.log(`[startup] ${existingCount} services in DB`);
}

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}

wss.on("connection", async (ws) => {
  try {
    const summary = await buildSummary();
    ws.send(JSON.stringify({ type: "summary", ...summary }));
  } catch {}
  ws.on("error", console.error);
});

try {
  const nc  = await natsConnect({ servers: NATS_URL });
  const sc  = StringCodec();
  const js  = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  try {
    await jsm.streams.add({ name: "WATCHTOWER", subjects: ["watchtower.events.*"] });
  } catch {}

  const consumer = await js.consumers.get("WATCHTOWER");
  const sub      = await consumer.consume();

  (async () => {
    for await (const msg of sub) {
      try {
        broadcast(JSON.parse(sc.decode(msg.data)));
        msg.ack();
      } catch {}
    }
  })();

  console.log("[nats] listening for events");
} catch (e) {
  console.warn("[nats] unavailable:", e.message);
}

async function buildSummary() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [total, up, down, degraded, pending, alertsToday, latAgg] = await Promise.all([
    Service.countDocuments(),
    Service.countDocuments({ status: "up" }),
    Service.countDocuments({ status: "down" }),
    Service.countDocuments({ status: "degraded" }),
    Service.countDocuments({ status: "pending" }),
    Alert.countDocuments({ createdAt: { $gte: todayStart } }),
    Event.aggregate([
      { $sort: { _id: -1 } },
      { $limit: 500 },
      { $group: { _id: null, avg: { $avg: "$latency_ms" } } },
    ]),
  ]);

  return {
    total, up, down, degraded, pending,
    alerts_today: alertsToday,
    avg_latency_ms: latAgg[0] ? Math.round(latAgg[0].avg * 10) / 10 : 0,
    generated_at: new Date().toISOString(),
  };
}

app.get("/health", (_, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

app.get("/services", async (_, res) => {
  const svcs = await Service.find().lean();
  res.json(svcs.map(s => ({ ...s, id: s._id.toString() })));
});

app.post("/services", async (req, res) => {
  const { name, url, interval_seconds = 30, alert_email, alert_webhook } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url required" });
  const svc = await Service.create({ name, url, interval_seconds, alert_email, alert_webhook });
  res.json({ id: svc._id.toString(), message: `Watching ${url}` });
});

app.delete("/services/:id", async (req, res) => {
  await Service.deleteOne({ _id: req.params.id });
  await Event.deleteMany({ service_id: req.params.id });
  res.json({ ok: true });
});

app.get("/services/:id/events", async (req, res) => {
  const limit  = Number(req.query.limit) || 50;
  const events = await Event.find({ service_id: req.params.id })
    .sort({ ts: -1 }).limit(limit).lean();
  res.json(events);
});

app.get("/dashboard/summary", async (_, res) => {
  try {
    const cached = await redis.get("dashboard:summary");
    if (cached) return res.json(JSON.parse(cached));
  } catch {}
  const summary = await buildSummary();
  try { await redis.setex("dashboard:summary", 15, JSON.stringify(summary)); } catch {}
  res.json(summary);
});

app.post("/services/:id/analyze", async (req, res) => {
  const events = await Event.find({ service_id: req.params.id })
    .sort({ ts: -1 }).limit(20).lean();
  if (!events.length)
    return res.status(404).json({ error: "No events yet — wait for the first poll (30s)" });

  const svc     = await Service.findById(req.params.id).lean();
  const name    = svc?.name || req.params.id;
  const lines   = events.map(e =>
    `[${e.ts}] status=${e.status} latency=${e.latency_ms}ms http=${e.status_code ?? "?"} error=${e.error ?? "none"}`
  ).join("\n");

  const prompt = `You are a senior SRE analyzing real health check data from WatchTower monitoring system.

Service: ${name}
URL: ${svc?.url ?? ""}
Last ${events.length} health checks (newest first):

${lines}

Respond in exactly this format:
PATTERN: (one sentence describing what the data shows)
ROOT_CAUSE: (specific technical cause — e.g. "connection pool exhaustion", "upstream timeout", "rate limiting")
SEVERITY: LOW | MEDIUM | HIGH | CRITICAL
REMEDIATION:
- (specific action 1)
- (specific action 2)
- (specific action 3)

Be direct. Think like a principal SRE who has debugged this exact pattern before.`;

  const result   = await gemini.generateContent(prompt);
  const analysis = result.response.text().trim();

  await Analysis.create({ service_id: req.params.id, service_name: name, analysis, event_count: events.length });
  broadcast({ type: "ai_analysis", service_id: req.params.id, analysis });
  res.json({ service_id: req.params.id, service_name: name, analysis });
});

app.post("/services/:id/report", async (req, res) => {
  const svc = await Service.findById(req.params.id).lean();
  if (!svc) return res.status(404).json({ error: "Service not found" });

  const [events, analyses] = await Promise.all([
    Event.find({ service_id: req.params.id }).sort({ ts: -1 }).limit(100).lean(),
    Analysis.find({ service_id: req.params.id }).sort({ createdAt: -1 }).limit(1).lean(),
  ]);

  const chunks = [];
  const doc    = new PDFDocument({ margin: 40, size: "A4" });
  doc.on("data", c => chunks.push(c));

  const up     = events.filter(e => e.status === "up").length;
  const down   = events.filter(e => e.status === "down").length;
  const deg    = events.filter(e => e.status === "degraded").length;
  const lats   = events.map(e => e.latency_ms).filter(Boolean);
  const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
  const uptime = events.length ? Math.round((up / events.length) * 1000) / 10 : 0;

  doc.fillColor("#111").rect(0, 0, 595, 70).fill();
  doc.fillColor("#fff").fontSize(18).font("Helvetica-Bold").text("WatchTower — Post-Mortem Report", 40, 18);
  doc.fontSize(9).font("Helvetica")
     .text(`${svc.name}  ·  ${svc.url}`, 40, 44)
     .text(`Generated: ${new Date().toUTCString()}`, 40, 56);
  doc.moveDown(2);
  doc.fillColor("#111").fontSize(11).font("Helvetica-Bold")
     .text(`Uptime: ${uptime}%   UP: ${up}   DEGRADED: ${deg}   DOWN: ${down}   Avg: ${avgLat}ms`);
  doc.moveDown();

  if (analyses.length) {
    doc.fontSize(13).font("Helvetica-Bold").fillColor("#111").text("AI Root-Cause Analysis");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#333").text(analyses[0].analysis, { lineGap: 3 });
    doc.moveDown();
  }

  doc.fontSize(13).font("Helvetica-Bold").fillColor("#111")
     .text(`Health Check Log (last ${Math.min(events.length, 50)} events)`);
  doc.moveDown(0.3);

  const cols = { ts: 40, status: 175, code: 240, lat: 285, err: 330 };
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#fff").rect(35, doc.y, 525, 16).fill("#111");
  const hy = doc.y;
  doc.fillColor("#fff")
     .text("Timestamp", cols.ts, hy + 3)
     .text("Status",    cols.status, hy + 3)
     .text("HTTP",      cols.code,   hy + 3)
     .text("Latency",   cols.lat,    hy + 3)
     .text("Error",     cols.err,    hy + 3);
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(9);

  const rowColors = { up: "#1a7a3c", down: "#b91c1c", degraded: "#92400e" };
  events.slice(0, 50).forEach((e, i) => {
    if (doc.y > 750) doc.addPage();
    doc.rect(35, doc.y, 525, 14).fill(i % 2 === 0 ? "#f7f7f7" : "#fff");
    const ry = doc.y;
    doc.fillColor(rowColors[e.status] || "#333").font("Helvetica-Bold")
       .text((e.status || "").toUpperCase(), cols.status, ry + 2);
    doc.fillColor("#333").font("Helvetica")
       .text((e.ts || "").slice(0, 19),      cols.ts,     ry + 2)
       .text(String(e.status_code ?? "—"),   cols.code,   ry + 2)
       .text(`${e.latency_ms ?? "—"}ms`,     cols.lat,    ry + 2)
       .text((e.error || "").slice(0, 35),   cols.err,    ry + 2);
    doc.moveDown(0.15);
  });

  doc.end();
  await new Promise(r => doc.on("end", r));
  const pdfBuffer = Buffer.concat(chunks);

  const filename = `watchtower_${req.params.id}_${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: filename,
    Body: pdfBuffer,
    ContentType: "application/pdf",
  }));

  const url = `${S3_ENDPOINT}/${S3_BUCKET}/${filename}`;
  await Report.create({ service_id: req.params.id, service_name: svc.name, url, filename });
  res.json({ url, filename, events_included: Math.min(events.length, 100) });
});

server.listen(PORT, () => console.log(`[watchtower] listening on :${PORT}`));
