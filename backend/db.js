import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      url           TEXT NOT NULL,
      status        TEXT DEFAULT 'pending',
      last_checked  TEXT,
      alert_webhook TEXT,
      alert_email   TEXT,
      is_demo       BOOLEAN DEFAULT false,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id           SERIAL PRIMARY KEY,
      service_id   INTEGER,
      service_name TEXT,
      url          TEXT,
      ts           TEXT,
      status       TEXT,
      status_code  INTEGER,
      latency_ms   NUMERIC,
      error        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id           SERIAL PRIMARY KEY,
      service_id   INTEGER,
      service_name TEXT,
      analysis     TEXT,
      event_count  INTEGER,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id           SERIAL PRIMARY KEY,
      service_id   INTEGER,
      service_name TEXT,
      status       TEXT,
      latency_ms   NUMERIC,
      error        TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reports (
      id           SERIAL PRIMARY KEY,
      service_id   INTEGER,
      service_name TEXT,
      url          TEXT,
      filename     TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_events_service_ts ON events(service_id, ts DESC);
  `);
  console.log("[db] tables ready");
}

export async function seedIfEmpty(port) {
  const { rows } = await pool.query("SELECT COUNT(*) FROM services");
  if (parseInt(rows[0].count) > 0) {
    console.log(`[startup] ${rows[0].count} services in DB`);
    return;
  }
  await pool.query(
    `INSERT INTO services (name, url, is_demo) VALUES ($1,$2,$3),($4,$5,$6),($7,$8,$9),($10,$11,$12)`,
    [
      "Healthy service",         "https://httpbin.org/status/200", true,
      "Degraded service (slow)", "https://httpbin.org/delay/3",    true,
      "Broken service (500)",    "https://httpbin.org/status/500", true,
      "WatchTower itself",       `http://backend:${port}/health`,  true,
    ]
  );
  console.log("[startup] seeded 4 demo services");
}
