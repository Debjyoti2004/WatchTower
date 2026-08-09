import fetch from "node-fetch";

export async function checkService(svc, { pool, js, sc }) {
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
  const event = { service_id: svc.id, service_name: svc.name, url: svc.url, ts, status, status_code: code, latency_ms, error };

  await pool.query(
    `INSERT INTO events (service_id, service_name, url, ts, status, status_code, latency_ms, error)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [svc.id, svc.name, svc.url, ts, status, code, latency_ms, error]
  );

  await pool.query(
    "UPDATE services SET status=$1, last_checked=$2 WHERE id=$3",
    [status, ts, svc.id]
  );

  try {
    await js.publish(`watchtower.events.${svc.id}`, sc.encode(JSON.stringify(event)));
  } catch (e) {
    console.error(`[nats] publish failed for ${svc.name}:`, e.message);
  }

  if ((status === "down" || status === "degraded") && svc.alert_webhook) {
    try {
      await fetch(svc.alert_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `WatchTower ALERT: ${svc.name} is ${status.toUpperCase()}`, ...event }),
      });
    } catch {}
    await pool.query(
      "INSERT INTO alerts (service_id, service_name, status, latency_ms, error) VALUES ($1,$2,$3,$4,$5)",
      [svc.id, svc.name, status, latency_ms, error]
    );
  }

  const icon = { up: "✅", down: "❌", degraded: "▲" }[status] ?? "?";
  console.log(`${icon}  ${svc.name.padEnd(30)} ${status.padEnd(10)} ${String(latency_ms).padStart(6)}ms`);
}
