# WSL/Ubuntu Setup Guide — InfraMind-SentinelX Platform

This guide walks you through setting up the **InfraMind-SentinelX** Next.js platform on **Windows Subsystem for Linux (Ubuntu 22.04+)** with **real Docker**, **real Kubernetes (minikube)**, the **InfraMind load generator** (CPU/memory/disk/network stress), and the **SentinelX threat detection pipeline**.

After completing this guide, the following will be live and observable from the dashboard:

| Subsystem | Real Source | Endpoint |
|---|---|---|
| Host metrics (CPU, mem, disk, net) | `/proc` | `GET /api/v1/live` |
| Docker containers | `docker ps` + `docker stats` | `GET /api/v1/containers` |
| Kubernetes resources | `kubectl get pods/nodes/deploy` | `GET /api/v1/k8s` |
| Load injection (CPU/mem/disk/net) | Detached worker processes | `POST /api/v1/load` |
| SentinelX threat events | Linux collectors (file/USB/registry-equivalent/process/network) | `GET /api/v1/sentinelx/events` |
| SentinelX threat simulation | Real observable threat events | `POST /api/v1/sentinelx/simulate` |
| Policy compiler (DSL) | Pure-TypeScript tokenizer + AST + evaluator | `POST /api/v1/sentinelx/compiler/compile` |
| Encrypted backups | SHA-256 integrity hash + DB record | `POST /api/v1/sentinelx/backup` |

---

## 0. Prerequisites

- **Windows 10/11** with **WSL2** enabled and **Ubuntu 22.04 LTS** (or newer) installed from the Microsoft Store.
- At least **8 GB RAM** (16 GB recommended — minikube + Next.js + Docker easily consume 4 GB).
- At least **20 GB free disk space** in your WSL distro.
- **Optional but recommended:** Docker Desktop for Windows with **WSL2 integration** enabled (Settings → Resources → WSL Integration → Ubuntu). If you do this, you can skip Step 2 below — Docker Desktop will provide `docker` inside WSL automatically.

To check if you have WSL2 + Ubuntu:

```powershell
# In Windows PowerShell (not WSL)
wsl --list --verbose
# Should show:
#   NAME            STATE           VERSION
#   Ubuntu-22.04    Running         2
```

If `VERSION` is `1`, upgrade with `wsl --set-version Ubuntu-22.04 2` (this takes ~5 minutes).

---

## 1. One-command automated setup

From inside your WSL Ubuntu shell (open "Ubuntu" from the Start Menu):

```bash
cd /home/z/my-project
chmod +x scripts/wsl-setup.sh
./scripts/wsl-setup.sh
```

This will:

1. Install system packages (curl, git, python3, build-essential, etc.)
2. Install Docker Engine + start the daemon + pull a demo `alpine` container
3. Install `kubectl` + `minikube` + start a single-node cluster + install `metrics-server`
4. Install Node.js 20 + Bun + project dependencies + initialize the SQLite database via Prisma
5. Verify everything is working

The script takes **5–10 minutes** the first time (most of it is minikube pulling the Kubernetes control plane images). You can re-run it safely — it's idempotent.

To run only one phase:

```bash
./scripts/wsl-setup.sh docker        # only Docker
./scripts/wsl-setup.sh k8s           # only kubectl + minikube
./scripts/wsl-setup.sh deps         # only Node/Bun/Prisma deps
./scripts/wsl-setup.sh verify       # only verify what's installed
```

---

## 2. Enable systemd in WSL (required for `systemctl start docker`)

If the script complains that Docker daemon won't start, you need to enable systemd in WSL.

Edit `/etc/wsl.conf` (create it if missing):

```bash
sudo tee /etc/wsl.conf <<EOF
[boot]
systemd=true
EOF
```

Then **restart WSL** from Windows PowerShell:

```powershell
wsl --shutdown
```

Re-open your Ubuntu shell and re-run `./scripts/wsl-setup.sh docker`. Docker should now start automatically on every WSL boot.

> **Alternative:** If you can't enable systemd, you can start Docker manually each time:
> ```bash
> sudo service docker start
> # OR
> sudo dockerd > /tmp/dockerd.log 2>&1 &
> ```

---

## 3. Start the Next.js dev server

Once setup is complete:

```bash
cd /home/z/my-project
bun run dev
# OR (if you don't have bun)
npm run dev
```

The dashboard will be live at **http://localhost:3000**.

Open these URLs in your browser to verify each subsystem:

| URL | What you should see |
|---|---|
| http://localhost:3000/api/v1/live | Real CPU/mem/disk/net from `/proc` |
| http://localhost:3000/api/v1/containers | Live Docker containers (with CPU% per container) |
| http://localhost:3000/api/v1/k8s | Live K8s pods/deployments/nodes |
| http://localhost:3000/api/v1/sentinelx/dashboard | SOC summary (event counts, threat scores, infra status) |
| http://localhost:3000/api/v1/status | Platform status |

---

## 4. Trigger the orchestrator's SRE cycle

The orchestrator runs an end-to-end pipeline every cycle:

1. Collect real metrics from `/proc` (CPU, mem, disk, net)
2. Collect real endpoint telemetry (processes, network connections, auth logs)
3. Collect SentinelX events (file integrity, USB, registry-equivalent)
4. Persist Docker + K8s snapshots to Prisma/SQLite
5. Normalize to OCSF + run threat engine + policy compiler
6. Detect anomalies (IF, DBSCAN, Z-Score, memory-leak slope)
7. Forecast next 7 days (4 models)
8. Generate threshold incidents (60% CPU → warning, 85% → critical)
9. Generate recommendations
10. Compute health + risk scores per host

Trigger one cycle manually:

```bash
curl -X POST http://localhost:3000/api/v1/cron
```

Or start the auto-cycle (runs every 60s by default):

```bash
curl -X POST http://localhost:3000/api/v1/cron \
  -H 'Content-Type: application/json' \
  -d '{"action":"auto-start","intervalMs":60000}'
```

Stop it:

```bash
curl -X POST http://localhost:3000/api/v1/cron \
  -H 'Content-Type: application/json' \
  -d '{"action":"auto-stop"}'
```

---

## 5. InfraMind load generator — CPU / memory / disk / network stress

The dashboard exposes **real load injection** that spawns detached worker processes on the host. This is the InfraMind feature for testing the anomaly + incident pipeline end-to-end (the user flow is: "Inject CPU Load → anomaly detected → incident auto-created").

### From the API

```bash
# CPU — burns Math.sqrt in a loop, one worker per core (max 2x cores)
curl -X POST http://localhost:3000/api/v1/load \
  -H 'Content-Type: application/json' \
  -d '{"type":"cpu","host":"localhost","intensity":0.85,"durationMin":3}'

# Memory — allocates intensity*512MB and touches every 4KB page (forces commit)
curl -X POST http://localhost:3000/api/v1/load \
  -H 'Content-Type: application/json' \
  -d '{"type":"memory","host":"localhost","intensity":0.7,"durationMin":2}'

# Disk — writes 64–512KB chunks to /tmp with fsync (50MB file cap, rewrite from offset 0)
curl -X POST http://localhost:3000/api/v1/load \
  -H 'Content-Type: application/json' \
  -d '{"type":"disk","host":"localhost","intensity":0.8,"durationMin":2}'

# Network — fires concurrent HTTP GETs to /api/v1/live (shows up on the lo interface)
curl -X POST http://localhost:3000/api/v1/load \
  -H 'Content-Type: application/json' \
  -d '{"type":"network","host":"localhost","intensity":0.7,"durationMin":2}'

# List active loads
curl http://localhost:3000/api/v1/load
```

### Expected impact

| Load type | What you'll see | Where |
|---|---|---|
| cpu | CPU gauge jumps to 60–100% within 2–4s | `/api/v1/live` `cpuPercent` |
| memory | Memory gauge jumps ~25% within 2–4s | `/api/v1/live` `memoryPercent` |
| disk | Disk IO gauge (MB/s) spikes within 2–4s | `/api/v1/live` `diskReadMBps` + `diskWriteMBps` |
| network | Network RX/TX gauges spike within 2–4s | `/api/v1/live` `netRxMbps` + `netTxMbps` |

### Auto-incident generation

After 8–10 seconds of injected load, run an SRE cycle:

```bash
curl -X POST http://localhost:3000/api/v1/cron
```

You should see new incidents appear at `/api/v1/incidents` with severity proportional to the load intensity. The thresholds are:

| Metric | Warning | Critical |
|---|---|---|
| CPU % | 60 | 85 |
| Memory % | 60 | 85 |
| Disk % | 70 | 90 |
| Disk IO (MB/s) | 50 | 100 |
| Network (Mbps) | 100 | 500 |
| Load avg (per core) | 2 | 4 |

### How the load generator works (implementation detail)

Each load type spawns **detached child processes** via `child_process.spawn()` with `stdio: 'ignore'` and `child.unref()`. The worker code is written to a `.cjs` file in `os.tmpdir()` first (writing inline code via `fork()` doesn't survive Next.js hot reloads). After `durationMs + 2000` ms, the parent kills the worker with `SIGKILL` and unlinks the temp file.

- **CPU** spawns `Math.max(2, ceil(intensity * cores * 2))` workers (a single Node process can only saturate one core).
- **Memory** allocates `intensity * 512` MB of `Buffer.alloc(1MB)` chunks and touches every 4 KB page (otherwise Linux overcommit won't commit physical RAM and the gauge won't move).
- **Disk** writes 64–512 KB chunks to a single temp file with `fs.fsyncSync(fd)`, wrapping at 50 MB (we want I/O bandwidth, not disk space consumption).
- **Network** fires up to 15 concurrent HTTP GETs to `http://localhost:PORT/api/v1/live` (the heaviest endpoint — collects system + processes + docker), across `ceil(intensity * 8)` workers (min 3).

---

## 6. SentinelX threat detection — file / USB / registry / process / network

The SentinelX subsystem runs **real Linux collectors** on every orchestrator cycle. They are ported from the original Windows-only SentinelX agent (which uses `psutil` + `watchdog` + `winreg`) to Linux equivalents:

| SentinelX (Windows) | This project (Linux/WSL) |
|---|---|
| `psutil.process_iter()` | `ps -eo pid,comm,user,pcpu,pmem,rss,args` |
| `psutil.net_connections(kind='inet')` | `ss -tunp` |
| `psutil.disk_partitions()` | `/proc/mounts` |
| `watchdog` (file events) | `fs.statSync` mtime + size snapshot per cycle |
| `winreg` (Windows registry) | Snapshot of `/etc/passwd`, `/etc/shadow`, `/etc/sudoers`, `/etc/ssh/sshd_config`, `/etc/crontab`, `~/.bashrc`, `~/.profile`, `/etc/cron.d`, `/var/spool/cron/crontabs`, `/etc/init.d`, `/etc/systemd/system` |

### What it detects

- **Suspicious process names**: `vssadmin`, `cipher`, `wbadmin`, `bcdedit`, `mimikatz`, `nmap`, `nc`, `ncat`, `hydra`, `john`, `hashcat`, `masscan`, `metasploit`, `msfconsole`, `empire`, `powershell`, `cmd.exe`
- **Encoded PowerShell**: any cmdline containing `EncodedCommand` or `-enc`
- **High CPU/RSS**: process with `cpu > 90%` or `RSS > 500 MB`
- **Suspicious file extensions**: `.encrypted`, `.locked`, `.crypto`, `.locky`, `.crypt`, `.enc`, `.ransom`
- **Config file modification**: any tracked file under `/etc/`, `~/.bashrc`, `~/.profile`, etc.
- **USB device insertion / removal**: removable mounts under `/media/` or `/mnt/` or `/dev/sd*`
- **Persistence location modification**: changes to `/etc/systemd/system/`, `/etc/init.d/`, `/etc/cron.d/`, `~/.bashrc`, etc.
- **External network connections**: any non-RFC1918 destination IP, plus known C2 ports (4444, 4445, 6667, 9001, 9030, 9050, 9051, 9150, 1337, 31337)

### MITRE ATT&CK mapping

Each detected threat is mapped to MITRE ATT&CK:

| Indicator | MITRE ID | Tactic |
|---|---|---|
| `vssadmin delete shadows` | T1490 | Impact — Inhibit System Recovery |
| `.encrypted` / `.locky` / `.crypto` file | T1486 | Impact — Data Encrypted for Impact |
| PowerShell `-EncodedCommand` | T1059.001 | Execution — PowerShell |
| Registry/`~/.bashrc` persistence | T1547 | Persistence — Boot or Logon Autostart |
| C2 port (4444, 6667) | T1071 | Command and Control — Application Layer Protocol |
| Tor ports (9001, 9050) | T1071.001 | Command and Control — Web Protocols |
| Credential theft tools (mimikatz, hydra) | T1003 | Credential Access — OS Credential Dumping |

### Trigger a threat simulation

The dashboard exposes a `/api/v1/sentinelx/simulate` endpoint that **injects a real observable threat event** on this host (so you can exercise the threat-engine + policy-compiler pipeline without real malware):

```bash
# List available simulations
curl http://localhost:3000/api/v1/sentinelx/simulate

# Run a simulation — each one returns the threat analysis + policy verdict
curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"ransomware_recon"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"encoded_powershell"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"ransomware_extension"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"suspicious_registry"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"c2_beacon"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"malicious_download"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"high_cpu_process"}'

curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"usb_insert"}'
```

Each simulation:

1. Performs a real observable action (spawns a process with a suspicious name, creates a `.encrypted` file, modifies a tracked config file, etc.)
2. Persists a `SecurityEvent` record in the DB
3. Runs the threat engine + policy compiler
4. Returns the threat score, classification, MITRE ATT&CK ID, and any policy action that was triggered

### Default DSL policies (already seeded)

The platform ships with 5 default `.psec` policies:

```
POLICY BlockRansomwareRecon { IF process.name == "vssadmin.exe" THEN ACTION create_incident }
POLICY EncodedPowerShell { IF process.name == "powershell.exe" AND process.cmdline IN ["EncodedCommand", "-enc"] THEN ACTION create_incident }
POLICY SuspiciousRegistryRunKey { IF registry.key IN ["Run", "CurrentVersion\\Run"] THEN ACTION create_incident }
POLICY RansomwareFileExtension { IF file.extension IN [".encrypted", ".locked", ".crypto", ".locky"] THEN ACTION quarantine_file }
POLICY HighCpuProcess { IF process.cpu_percent > 90 THEN ACTION notify }
```

Test the compiler:

```bash
# Compile a custom policy
curl -X POST http://localhost:3000/api/v1/sentinelx/compiler/compile \
  -H 'Content-Type: application/json' \
  -d '{"policy_text":"POLICY TestPolicy { IF process.name == \"cmd.exe\" THEN ACTION block_process }"}'

# Evaluate a policy against a synthetic event
curl -X POST http://localhost:3000/api/v1/sentinelx/compiler/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "policy_text":"POLICY TestPolicy { IF process.name == \"cmd.exe\" THEN ACTION block_process }",
    "event_type":"process",
    "raw_data":{"name":"cmd.exe","pid":1234}
  }'
```

### Encrypted backup

The platform supports AES-256-GCM encrypted backups with SHA-256 integrity hashes:

```bash
# Trigger a backup of /tmp
curl -X POST http://localhost:3000/api/v1/sentinelx/backup \
  -H 'Content-Type: application/json' \
  -d '{"sourcePath":"/tmp","triggeredBy":"manual"}'

# List backups
curl http://localhost:3000/api/v1/sentinelx/backup

# Verify a backup's integrity hash
curl -X POST http://localhost:3000/api/v1/sentinelx/backup \
  -H 'Content-Type: application/json' \
  -d '{"action":"verify","backupId":"<id-from-list>"}'

# Restore a backup (marks as restored)
curl -X POST http://localhost:3000/api/v1/sentinelx/backup \
  -H 'Content-Type: application/json' \
  -d '{"action":"restore","backupId":"<id>","restorePath":"/tmp/restore"}'
```

---

## 7. Verify the full pipeline end-to-end

Run this end-to-end smoke test:

```bash
# 1. Start the dev server (in one terminal)
cd /home/z/my-project
bun run dev

# 2. In another terminal:
# Trigger a CPU load
curl -X POST http://localhost:3000/api/v1/load \
  -H 'Content-Type: application/json' \
  -d '{"type":"cpu","host":"localhost","intensity":0.85,"durationMin":3}'

# Wait ~8s for the load to actually register
sleep 8

# Trigger a SRE cycle — should create a CPU warning/critical incident
curl -X POST http://localhost:3000/api/v1/cron

# Check that the incident was created
curl http://localhost:3000/api/v1/incidents | jq '.incidents[0:3]'

# Trigger a SentinelX threat simulation
curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \
  -H 'Content-Type: application/json' \
  -d '{"type":"ransomware_recon"}'

# Check that the threat event was persisted
curl 'http://localhost:3000/api/v1/sentinelx/incidents?limit=5' | jq '.incidents[0:3]'
```

You should see:

- A `cpu` warning or critical incident in `/api/v1/incidents` with `severity: warning|critical` and `businessImpact: high|critical`
- A `process` threat event in `/api/v1/sentinelx/incidents` with `classification: ransomware`, `threat_score: 85+`, and `mitre_attack_id: T1490`

---

## 8. Troubleshooting

### `docker: Cannot connect to the Docker daemon`

Either:

1. The Docker daemon isn't running. Start it:
   ```bash
   sudo service docker start
   # OR (if systemd enabled)
   sudo systemctl start docker
   ```
2. Your user isn't in the `docker` group. Fix:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   # OR log out and back in
   ```

### `minikube start` hangs or fails

Most common cause: not enough memory. Minikube needs **2 GB minimum** free. Try:

```bash
minikube delete
minikube start --memory=4096 --cpus=2 --driver=docker
```

If `--driver=docker` fails (e.g. permission denied), try `--driver=none` (requires `sudo`).

### `kubectl top pods` shows no CPU/mem

The metrics-server isn't installed or hasn't finished starting. Install it:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# Wait ~60s for it to be ready
kubectl get pods -n kube-system | grep metrics-server
```

### `/api/v1/containers` returns `available: false`

Either Docker isn't installed, or the daemon isn't running. The `reason` field in the response tells you exactly which:

```bash
curl -s http://localhost:3000/api/v1/containers | jq '.live'
# { "available": false, "reason": "Docker daemon is not running. ..." }
```

### `/api/v1/k8s` returns `available: false`

Same pattern — `kubectl` is missing or no cluster is reachable:

```bash
curl -s http://localhost:3000/api/v1/k8s | jq '.live'
# { "available": false, "reason": "No Kubernetes cluster reachable. ..." }
```

### Load injection doesn't seem to affect the gauges

1. The orchestrator's `/api/v1/live` endpoint is polled by the dashboard every 2s. If you don't see movement, **wait 4–6 seconds** after triggering the load.
2. Check that workers are actually running:
   ```bash
   ps -ef | grep inframind- | grep -v grep
   ```
3. CPU load on multi-core machines needs the multi-worker spawn (the code does this — but verify with `htop`).

### Database errors (`PrismaClientInitializationError`)

The SQLite database hasn't been initialized:

```bash
cd /home/z/my-project
bunx prisma db push --accept-data-loss
# OR
npx prisma db push --accept-data-loss
```

### Port 3000 is already in use

```bash
# Find what's using it
sudo lsof -i :3000
# Kill it
sudo kill -9 <pid>
# OR run on a different port
PORT=3001 bun run dev
```

If you change the port, also update the load generator's network worker target (set the `PORT` env var, which it reads).

---

## 9. What's intentionally NOT implemented

To set expectations — the following are deliberately out of scope for this port:

1. **Destructive container/k8s ops** (`docker stop`, `kubectl delete pod`, `kubectl scale`). The collectors are **read-only** — they monitor, they don't mutate. Recommendations may *suggest* `kubectl scale deployment X --replicas=N+1`, but the platform never executes that.
2. **Real-time file watcher** (chokidar). The Linux port snapshots file state per orchestrator cycle (every 60s by default) instead of streaming events. For real-time file watching, run a separate `chokidar` daemon — out of scope for this initial port.
3. **Real WebSocket push**. The platform currently uses HTTP polling (every 2s) for the live dashboard. The InfraMind original ships a Socket.io mini-service on port 3001; integrating that into this Next.js project is a separate task.
4. **Actual quarantine** of files / killing of suspicious processes. The policy compiler evaluates `quarantine_file`, `block_process`, `isolate_agent` actions and records them on the event — but does not actually execute them. This is a deliberate safety decision (don't let an automated policy kill a process on the host). To wire up enforcement, add a response executor that consumes `policyAction` from the SecurityEvent and invokes the appropriate tool via `/api/v1/ai-gateway/execute`.

---

## 10. Quick reference — all new endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/containers` | Live Docker containers + persisted DB rows |
| GET | `/api/v1/k8s` | Live K8s pods/deployments/nodes + persisted DB rows |
| GET | `/api/v1/load` | List active load injections |
| POST | `/api/v1/load` | Start a load injection (cpu/memory/disk/network) |
| GET | `/api/v1/sentinelx/events` | Recent SentinelX events |
| POST | `/api/v1/sentinelx/events` | Submit a synthetic event (agent-style) |
| GET | `/api/v1/sentinelx/incidents` | Events with threat_score >= 50 |
| GET | `/api/v1/sentinelx/dashboard` | SOC summary + infra status |
| GET | `/api/v1/sentinelx/module/{type}` | Filter events by type (file/process/network/registry/usb/system) |
| GET | `/api/v1/sentinelx/simulate` | List available threat simulations |
| POST | `/api/v1/sentinelx/simulate` | Run a threat simulation (8 types available) |
| POST | `/api/v1/sentinelx/compiler/compile` | Compile a `.psec` DSL policy |
| POST | `/api/v1/sentinelx/compiler/evaluate` | Compile + evaluate a policy against an event |
| GET | `/api/v1/sentinelx/backup` | List backups |
| POST | `/api/v1/sentinelx/backup` | Create / verify / restore a backup |

---

## 11. Files added / modified

| File | Role |
|---|---|
| `src/lib/collectors/docker.ts` | Docker container collector (uses `docker ps` + `docker stats`) |
| `src/lib/collectors/kubernetes.ts` | K8s collector (uses `kubectl get pods/nodes/deploy`) |
| `src/lib/engines/load-generator.ts` | InfraMind load generator (CPU/mem/disk/network stress with detached workers) |
| `src/lib/collectors/sentinelx-linux.ts` | SentinelX Linux collectors (file/USB/registry/process/network) |
| `src/lib/engines/sentinelx-simulator.ts` | Threat simulation engine (8 attack scenarios) |
| `src/app/api/v1/containers/route.ts` | Live Docker endpoint |
| `src/app/api/v1/k8s/route.ts` | Live K8s endpoint |
| `src/app/api/v1/load/route.ts` | Load generator endpoint |
| `src/app/api/v1/sentinelx/events/route.ts` | SentinelX events endpoint |
| `src/app/api/v1/sentinelx/incidents/route.ts` | SentinelX incidents endpoint |
| `src/app/api/v1/sentinelx/dashboard/route.ts` | SOC dashboard summary endpoint |
| `src/app/api/v1/sentinelx/module/[type]/route.ts` | Module-filtered events endpoint |
| `src/app/api/v1/sentinelx/simulate/route.ts` | Threat simulation endpoint |
| `src/app/api/v1/sentinelx/compiler/compile/route.ts` | Policy compiler endpoint |
| `src/app/api/v1/sentinelx/compiler/evaluate/route.ts` | Policy evaluator endpoint |
| `src/app/api/v1/sentinelx/backup/route.ts` | Encrypted backup endpoint |
| `src/lib/orchestrator.ts` | Wired in Docker + K8s + SentinelX collectors |
| `scripts/wsl-setup.sh` | One-command WSL/Ubuntu setup script |
| `docs/WSL-SETUP.md` | This file |
