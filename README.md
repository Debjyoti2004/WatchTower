# WatchTower

**Point it at a URL. It tells you why it's broken before you do.**

WatchTower is an AI-powered infrastructure monitoring platform built on Zerops. It polls every registered endpoint every 30 seconds, measures latency, detects anomalies, runs Groq-powered root-cause analysis, fires webhook alerts, and generates PDF post-mortem reports stored on S3-compatible object storage.

## Architecture

| Service | Type | Role |
|---|---|---|
| `frontend` | Node.js@22 | Next.js live dashboard |
| `backend` | Python@3.11 | FastAPI REST + WebSocket + Groq |
| `worker` | Python@3.11 | 30s polling loop |
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

### 2. Set secrets in Zerops GUI

Navigate to **backend → Environment Variables** and add:
```
GROQ_API_KEY = gsk_xxxxxxxxxxxxxxxxxxxx
```

Navigate to **frontend → Environment Variables** and add:
```
NEXT_PUBLIC_API_URL = https://backend-<hash>.zerops.app
```

### 3. Push and deploy

```bash
zcli push
```

## Demo Flow

1. Register 3 URLs: your backend `/health`, `httpbin.org/status/200`, `httpbin.org/delay/3`
2. Wait 30 seconds — watch events stream in via WebSocket
3. The `/delay/3` service shows **DEGRADED** (>2000ms)
4. Click **AI Analyze** — see Groq root-cause analysis
5. Click **PDF Report** — PDF opens from MinIO storage URL

## Tech Stack

- **Runtime AI**: Groq `llama-3.1-8b-instant`
- **Architecture + codegen**: Claude
- **Infrastructure**: Zerops (all 7 service types)
- **PDF generation**: reportlab
- **Charts**: recharts
