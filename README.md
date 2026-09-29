# InfraMind-SentinelX

**Production-Ready Autonomous SecOps + AIOps Platform**

Real-time infrastructure monitoring (Docker, Kubernetes, /proc metrics), AI-powered threat detection (SentinelX), RAG knowledge base, Agentic AI workflows, AES-256-GCM encrypted backups, MITRE ATT&CK attack path analysis, and 30+ security modules in one Next.js 16 application.

## Quick Start

```bash
# 1. Install dependencies (use Bun — faster than npm)
bun install

# 2. Copy environment file
cp .env.example .env
# Edit .env and fill in your credentials (optional — platform runs without them)

# 3. Create the database directory + initialize SQLite schema
mkdir -p db
bunx prisma generate
bunx prisma db push --accept-data-loss

# 4. Start the Next.js dev server (port 3003)
bun run dev

# 5. (Optional) Start the realtime WebSocket mini-service (port 3001)
# In another terminal:
bun run realtime
```

Open **http://localhost:3003** 🎉

## Optional: Real-time WebSocket service

The realtime mini-service (`mini-services/realtime-service/`) pushes live Ubuntu/WSL metrics (CPU, memory, disk, network, Docker containers, top processes) to the dashboard via WebSocket every 2 seconds. Without it, the dashboard falls back to HTTP polling every 3 seconds.

```bash
# In a separate terminal
bun run realtime
# Listening on http://localhost:3001  (ws://localhost:3001/ws)
```

## Optional: Docker + Kubernetes monitoring

Install Docker Desktop (Windows/Mac) or `docker.io` (Linux), then verify:
```bash
docker ps
# Run a demo container so the dashboard has something to show:
docker run -d --name inframind-demo --restart unless-stopped alpine:latest sh -c "while true; do sleep 60; done"
```

For Kubernetes, install `kubectl` + `minikube` (Linux/WSL):
```bash
minikube start --driver=docker --memory=2g --cpus=2
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

## Module overview (30 modules)

**Infrastructure**: Overview (KPIs + Inject Load + semicircular gauges), Live Monitor, Infrastructure, Anomalies (AI Remediation), Platform Health

**Security**: Security Events (with charts), Threat Detection (live evaluation tests), Incidents, Attack Paths (kill-chain flow), Threat Hunting (IOC search), Assets & Vulnerabilities, Audit Trail (real-time hash-chain), OCSF Events

**AI**: AI ChatOps (RAG-grounded), RAG Knowledge (semantic search + LLM rerank), Agentic AI (background workflows), Adversarial AI Tests (real LLM probing), AI Evaluation, AI Gateway (tool registry + HITL approvals)

**Governance**: Policy Compiler (.psec DSL), NIST CSF Posture, Users & RBAC, Integrations (Email + Jira + Slack)

**Recovery**: Backup & Recovery (AES-256-GCM), Reports, Settings

## Configuration

Edit `.env` to configure:
- **ZAI_API_KEY**: Enable real LLM responses (AI ChatOps, agents, adversarial tests, RAG reranking)
- **SMTP_***: Enable real email notifications for incidents
- **JIRA_***: Enable real Jira ticket creation for incidents
- **SLACK_WEBHOOK_URL**: Enable real Slack alerts
- **BACKUP_KEY**: Change the default AES-256-GCM encryption key

See `.env.example` for all options + comments.

## Commands

| Command | Purpose |
|---|---|
| `bun run dev` | Start Next.js dev server on port 3003 |
| `bun run realtime` | Start realtime WebSocket mini-service on port 3001 |
| `bun run build` | Build for production |
| `bun run start` | Start production server |
| `bun run lint` | Lint the codebase |
| `bunx prisma db push` | Reset/create SQLite DB |
| `bunx prisma generate` | Regenerate Prisma client |

## Architecture

```
┌─────────────────────────────────────────┐
│  Next.js 16 Dashboard (port 3003)       │
│  - 30 modules with real-time polling   │
│  - Tailwind CSS + shadcn/ui            │
│  - Recharts for graphs + gauges        │
└─────────────────────────────────────────┘
              │
              ├── HTTP REST API (/api/v1/*)
              │
              ▼
┌─────────────────────────────────────────┐
│  Next.js API Routes (server-side)       │
│  - Prisma ORM → SQLite (db/custom.db) │
│  - Real /proc collectors (CPU/mem/disk)│
│  - Docker collector (docker ps/stats)  │
│  - Kubernetes collector (kubectl)      │
│  - SentinelX threat engine + DSL       │
│  - LLM client (z-ai-web-dev-sdk)       │
│  - Email (nodemailer) + Jira + Slack   │
└─────────────────────────────────────────┘
              │
              ▼ (optional, for live push)
┌─────────────────────────────────────────┐
│  Bun Realtime Mini-Service (port 3001) │
│  - WebSocket push every 2s             │
│  - /proc + Docker + top processes      │
│  - No DB, just streaming              │
└─────────────────────────────────────────┘
```

## Files of interest

| Path | Purpose |
|---|---|
| `src/app/page.tsx` | Main dashboard with all 30 module views |
| `src/lib/collectors/system.ts` | Real /proc metrics collector |
| `src/lib/collectors/docker.ts` | Docker container collector |
| `src/lib/collectors/kubernetes.ts` | Kubernetes resource collector |
| `src/lib/collectors/sentinelx-linux.ts` | SentinelX Linux threat collectors |
| `src/lib/engines/load-generator.ts` | InfraMind CPU/mem/disk/network load injector |
| `src/lib/engines/threat-evaluator.ts` | Real-time threat evaluation tests |
| `src/lib/engines/threat-hunt.ts` | Dynamic threat hunt hypotheses + IOC search |
| `src/lib/engines/adversarial-ai.ts` | Real LLM-probing adversarial tests |
| `src/lib/engines/remediation-engine.ts` | LLM-generated remediation plans |
| `src/lib/engines/email-integration.ts` | Real SMTP email sender |
| `src/lib/engines/jira-integration.ts` | Real Jira REST API client |
| `src/lib/engines/backup-engine.ts` | Real AES-256-GCM encrypted backups |
| `src/lib/agents/background-runner.ts` | Background agent task runner |
| `src/lib/rag/engine.ts` | TF-IDF + stop words + Porter stemmer |
| `src/lib/rag/semantic-search.ts` | LLM-powered query expansion + reranking |
| `src/lib/engines/llm-client.ts` | z-ai-web-dev-sdk wrapper with fallback |
| `mini-services/realtime-service/index.js` | Bun WebSocket mini-service |
| `prisma/schema.prisma` | 50+ table database schema |
