import { Router } from "express";
import { pool } from "../db.js";
import { gemini } from "../clients.js";

export default function analyzeRouter(broadcast) {
  const router = Router();

  router.post("/services/:id/analyze", async (req, res) => {
    const { rows: events } = await pool.query(
      "SELECT * FROM events WHERE service_id=$1 ORDER BY ts DESC LIMIT 20",
      [req.params.id]
    );
    if (!events.length)
      return res.status(404).json({ error: "No events yet — wait for the first poll (30s)" });

    const { rows: svcs } = await pool.query("SELECT * FROM services WHERE id=$1", [req.params.id]);
    const svc  = svcs[0];
    const name = svc?.name || req.params.id;
    const lines = events.map(e =>
      `[${e.ts}] status=${e.status} latency=${e.latency_ms}ms http=${e.status_code ?? "?"} error=${e.error ?? "none"}`
    ).join("\n");

    const prompt = `You are a senior SRE analyzing real health check data from WatchTower.

Service: ${name}
URL: ${svc?.url ?? ""}
Last ${events.length} health checks (newest first):

${lines}

Respond in exactly this format:
PATTERN: (one sentence)
ROOT_CAUSE: (specific technical cause)
SEVERITY: LOW | MEDIUM | HIGH | CRITICAL
REMEDIATION:
- (action 1)
- (action 2)
- (action 3)

Be direct. Think like a principal SRE.`;

    const result   = await gemini.generateContent(prompt);
    const analysis = result.response.text().trim();

    await pool.query(
      "INSERT INTO analyses (service_id, service_name, analysis, event_count) VALUES ($1,$2,$3,$4)",
      [req.params.id, name, analysis, events.length]
    );
    broadcast({ type: "ai_analysis", service_id: req.params.id, analysis });
    res.json({ service_id: req.params.id, service_name: name, analysis });
  });

  return router;
}
