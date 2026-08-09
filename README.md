# WatchTower

**Point it at a URL. It tells you why it's broken before you do.**

WatchTower is an AI-powered infrastructure monitoring platform built on Zerops. It polls every registered endpoint every 30 seconds, measures latency, detects anomalies, runs Gemini-powered root-cause analysis, fires webhook alerts, and generates PDF post-mortem reports stored on MinIO object storage.

## Architecture

| Service | Type | Role |
|---|---|---|
| `frontend` | Node.js@22 | React + Vite live dashboard |
| `backend` | Node.js@22 | Express REST + WebSocket + Gemini AI |
| `worker` | Node.js@22 | 30s cron poller |
| `db` | MongoDB@7 | All persistent data |
| `cache` | Valkey@7.2 | 15s dashboard cache |
| `nats` | NATS@2.10 | Worker→backend event bus |
| `storage` | Object Storage | PDF post-mortem reports |

## Deploy to Zerops

### 1. Import infrastructure

```bash
npm install -g @zerops/zcli
zcli login
zcli project import import.yaml
```

Or go to [app.zerops.io](https://app.zerops.io) → New Project → Import YAML → paste `import.yaml`.

### 2. Set environment variables in Zerops GUI

Navigate to **backend → Environment Variables** and add:

```
GEMINI_API_KEY = AIza_your_key_here
```

Get a free key at [aistudio.google.com](https://aistudio.google.com).

Navigate to **frontend → Environment Variables** (build-time) and add:

```
BACKEND_URL = https://backend-<hash>.zerops.app
```

You get this URL after the backend is first deployed.

### 3. Push to GitHub and connect repo in Zerops

```bash
git add . && git commit -m "deploy"
git push
```

Then connect your GitHub repo in the Zerops GUI — it auto-deploys on every push.

## How it works

```
Second 0   → MongoDB, Valkey, NATS, MinIO start
Second 5   → Express backend starts, seeds 4 demo services into MongoDB
Second 8   → React frontend loads, shows 4 service cards (PENDING)
Second 30  → First cron poll fires
             → all 4 services checked concurrently
             → events: worker → MongoDB → NATS → backend → WebSocket → browser
             → dashboard updates live with real latency and status
```

## Demo flow

1. Open the frontend URL — 4 services already registered
2. Wait 30 seconds — watch events stream in live via WebSocket
3. The `delay/3` service shows **DEGRADED** (>2000ms latency)
4. Click **AI Analyze** — Gemini returns root-cause analysis
5. Click **PDF Report** — PDF opens from MinIO storage URL

## Tech stack

- **Runtime AI**: Google Gemini 2.0 Flash (`@google/generative-ai`)
- **Frontend**: React 18 + Vite + Tailwind CSS + Recharts
- **Backend**: Node.js + Express + WebSocket + PDFKit
- **Infrastructure**: Zerops (7 services)
- **Code generation**: Claude
