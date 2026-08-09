import { Router } from "express";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import PDFDocument from "pdfkit";
import { pool } from "../db.js";
import { s3 } from "../clients.js";

const router = Router();

router.post("/services/:id/report", async (req, res) => {
  const { rows: svcs } = await pool.query("SELECT * FROM services WHERE id=$1", [req.params.id]);
  if (!svcs.length) return res.status(404).json({ error: "Service not found" });
  const svc = svcs[0];

  const [{ rows: events }, { rows: analyses }] = await Promise.all([
    pool.query("SELECT * FROM events WHERE service_id=$1 ORDER BY ts DESC LIMIT 100", [req.params.id]),
    pool.query("SELECT * FROM analyses WHERE service_id=$1 ORDER BY created_at DESC LIMIT 1", [req.params.id]),
  ]);

  const chunks = [];
  const doc    = new PDFDocument({ margin: 40, size: "A4" });
  doc.on("data", c => chunks.push(c));

  const up     = events.filter(e => e.status === "up").length;
  const down   = events.filter(e => e.status === "down").length;
  const deg    = events.filter(e => e.status === "degraded").length;
  const lats   = events.map(e => parseFloat(e.latency_ms)).filter(Boolean);
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
       .text((e.ts || "").slice(0, 19),              cols.ts,   ry + 2)
       .text(String(e.status_code ?? "—"),           cols.code, ry + 2)
       .text(`${e.latency_ms ?? "—"}ms`,             cols.lat,  ry + 2)
       .text((e.error || "").slice(0, 35),           cols.err,  ry + 2);
    doc.moveDown(0.15);
  });

  doc.end();
  await new Promise(r => doc.on("end", r));
  const pdfBuffer = Buffer.concat(chunks);

  const { S3_BUCKET, S3_ENDPOINT } = process.env;
  const filename = `watchtower_${req.params.id}_${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: filename,
    Body: pdfBuffer,
    ContentType: "application/pdf",
  }));

  const url = `${S3_ENDPOINT}/${S3_BUCKET}/${filename}`;
  await pool.query(
    "INSERT INTO reports (service_id, service_name, url, filename) VALUES ($1,$2,$3,$4)",
    [req.params.id, svc.name, url, filename]
  );
  res.json({ url, filename, events_included: Math.min(events.length, 100) });
});

export default router;
