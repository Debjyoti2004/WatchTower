import { Router } from "express";
import { pool } from "../db.js";

const router = Router();

router.get("/health", (_, res) =>
  res.json({ status: "ok", ts: new Date().toISOString() })
);

router.get("/services", async (_, res) => {
  const { rows } = await pool.query("SELECT * FROM services ORDER BY created_at ASC");
  res.json(rows.map(s => ({ ...s, id: s.id.toString() })));
});

router.post("/services", async (req, res) => {
  const { name, url, alert_email, alert_webhook } = req.body;
  if (!name || !url) return res.status(400).json({ error: "name and url required" });
  const { rows } = await pool.query(
    "INSERT INTO services (name, url, alert_email, alert_webhook) VALUES ($1,$2,$3,$4) RETURNING *",
    [name, url, alert_email, alert_webhook]
  );
  res.json({ id: rows[0].id.toString(), message: `Watching ${url}` });
});

router.delete("/services/:id", async (req, res) => {
  await pool.query("DELETE FROM services WHERE id=$1", [req.params.id]);
  await pool.query("DELETE FROM events WHERE service_id=$1", [req.params.id]);
  res.json({ ok: true });
});

router.get("/services/:id/events", async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const { rows } = await pool.query(
    "SELECT * FROM events WHERE service_id=$1 ORDER BY ts DESC LIMIT $2",
    [req.params.id, limit]
  );
  res.json(rows);
});

export default router;
