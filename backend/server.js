import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { connect as natsConnect, StringCodec } from "nats";
import { pool, initDb, seedIfEmpty } from "./db.js";
import { buildSummary } from "./routes/dashboard.js";
import servicesRouter  from "./routes/services.js";
import dashboardRouter from "./routes/dashboard.js";
import analyzeRouter   from "./routes/analyze.js";
import reportRouter    from "./routes/report.js";

const { NATS_URL, PORT = "8000" } = process.env;

const app    = express();
const server = createServer(app);
const wss    = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

await initDb();
await seedIfEmpty(PORT);

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
      try { broadcast(JSON.parse(sc.decode(msg.data))); msg.ack(); } catch {}
    }
  })();
  console.log("[nats] listening for events");
} catch (e) {
  console.warn("[nats] unavailable:", e.message);
}

app.use(servicesRouter);
app.use(dashboardRouter);
app.use(analyzeRouter(broadcast));
app.use(reportRouter);

server.listen(PORT, () => console.log(`[watchtower] listening on :${PORT}`));
