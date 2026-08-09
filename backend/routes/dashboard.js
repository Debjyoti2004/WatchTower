import { Router } from "express";
import { pool } from "../db.js";
import { redis } from "../clients.js";

const router = Router();

export async function buildSummary() {
  const [counts, latency, alertsToday] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'up')       as up,
        COUNT(*) FILTER (WHERE status = 'down')     as down,
        COUNT(*) FILTER (WHERE status = 'degraded') as degraded,
        COUNT(*) FILTER (WHERE status = 'pending')  as pending
      FROM services
    `),
    pool.query(`
      SELECT AVG(latency_ms) as avg
      FROM (SELECT latency_ms FROM events ORDER BY id DESC LIMIT 500) sub
    `),
    pool.query(`SELECT COUNT(*) FROM alerts WHERE created_at >= CURRENT_DATE`),
  ]);

  const c = counts.rows[0];
  return {
    total:          parseInt(c.total),
    up:             parseInt(c.up),
    down:           parseInt(c.down),
    degraded:       parseInt(c.degraded),
    pending:        parseInt(c.pending),
    alerts_today:   parseInt(alertsToday.rows[0].count),
    avg_latency_ms: latency.rows[0].avg ? Math.round(parseFloat(latency.rows[0].avg) * 10) / 10 : 0,
    generated_at:   new Date().toISOString(),
  };
}

router.get("/dashboard/summary", async (_, res) => {
  try {
    const cached = await redis.get("dashboard:summary");
    if (cached) return res.json(JSON.parse(cached));
  } catch {}
  const summary = await buildSummary();
  try { await redis.setex("dashboard:summary", 15, JSON.stringify(summary)); } catch {}
  res.json(summary);
});

export default router;
