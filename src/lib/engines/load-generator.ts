// InfraMind Load Generator — real CPU / memory / disk / network stress on the host.
//
// Pattern: write a temp `.cjs` worker file to os.tmpdir(), spawn it detached with
// `stdio: 'ignore'` and `child.unref()`, then kill it with SIGKILL after
// durationMs + 2000 ms. This survives across Next.js hot reloads and Node/Bun
// restarts (fork() with inline code does not).
//
// Load types:
//   cpu     — spawn one worker per core (max 2x cores), burn Math.sqrt in a loop
//   memory  — allocate intensity*512MB, touch every 4KB page (forces commit)
//   disk    — write 64-512KB chunks to a temp file with fsync, 50MB cap
//   network — fire concurrent HTTP GETs to /api/v1/live every cycle
//
// When the load crosses the threshold engine's limits (60% CPU/mem, 50 MB/s disk
// IO, 100 Mbps network), the orchestrator auto-creates incidents so the demo
// flow "Inject CPU Load → Incident appears" works end-to-end.

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir, cpus } from 'os';
import { join } from 'path';

export interface LoadProfile {
  type: 'cpu' | 'memory' | 'disk' | 'network';
  host: string;
  intensity: number; // 0..1
  durationMin: number;
  startedAt: number;
  expectedDurationMs: number;
}

const activeLoads: LoadProfile[] = [];

function spawnWorker(code: string, label: string, durationMs: number): void {
  const file = join(tmpdir(), `inframind-${label}-${Date.now()}.cjs`);
  try {
    writeFileSync(file, code);
  } catch (e) {
    console.warn(`[load] failed to write worker file:`, e);
    return;
  }

  const runtime = process.execPath; // bun or node
  console.log(`[load] spawning ${label} worker via ${runtime} ${file}`);

  try {
    const child = spawn(runtime, [file], {
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    child.unref();

    // Cleanup after duration
    setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      try {
        unlinkSync(file);
      } catch {}
    }, durationMs + 2000);
  } catch (e) {
    console.warn(`[load] failed to spawn ${label} worker:`, e);
    try {
      unlinkSync(file);
    } catch {}
  }
}

function spawnCpuLoad(ms: number, intensity: number) {
  // Spawn MULTIPLE worker processes that burn CPU in parallel.
  // A single Node process can only saturate one core, so we spawn
  // ceil(intensity * cores * 2) workers (min 2, max 2x cores).
  const numCores = cpus().length;
  const numWorkers = Math.max(2, Math.min(numCores * 2, Math.ceil(intensity * numCores * 2)));
  console.log(`[load] Spawning ${numWorkers} CPU workers for ${ms}ms at intensity ${intensity}`);

  const workerCode = `
const end = Date.now() + ${ms};
const intensity = ${intensity};
function burn() {
  if (Date.now() > end) process.exit(0);
  const start = Date.now();
  while (Date.now() - start < intensity * 20) {
    Math.sqrt(Math.random() * 1000000);
  }
  setTimeout(burn, (1 - intensity) * 5);
}
burn();
`;

  for (let i = 0; i < numWorkers; i++) {
    spawnWorker(workerCode, `cpu-${i}-${Date.now()}`, ms);
  }
}

function spawnMemoryLoad(ms: number, intensity: number) {
  // Allocate large buffers in a separate process and hold them for ms.
  // Touch every 4KB page so Linux actually commits physical RAM
  // (overcommit would otherwise let the gauge stay flat).
  const targetMB = Math.floor(intensity * 512); // up to 512MB
  console.log(`[load] Allocating ${targetMB}MB of memory for ${ms}ms`);

  const workerCode = `
const chunks = [];
const targetMB = ${targetMB};
for (let i = 0; i < targetMB; i++) {
  try {
    const buf = Buffer.alloc(1024 * 1024);
    for (let j = 0; j < buf.length; j += 4096) {
      buf[j] = (i + j) & 0xff;
    }
    chunks.push(buf);
  } catch (e) {
    console.error("[load] alloc failed at", i, "MB:", e.message);
    break;
  }
}
console.log("[load] memory worker holding", chunks.length, "MB");
setTimeout(() => {
  chunks.length = 0;
  process.exit(0);
}, ${ms});
`;

  spawnWorker(workerCode, `memory-${Date.now()}`, ms);
}

function spawnDiskLoad(ms: number, intensity: number) {
  // Write files continuously for ms using fsync to force actual disk I/O.
  // Write to a single file and rewrite from offset 0 when reaching a 50MB cap
  // — we want I/O bandwidth, not disk space consumption.
  const writeSizeKB = Math.max(64, Math.floor(intensity * 512)); // 64KB - 512KB per write
  console.log(`[load] Writing ${writeSizeKB}KB chunks (fsync) for ${ms}ms`);

  const workerCode = `
const fs = require("fs");
const path = require("path");
const os = require("os");
const file = path.join(os.tmpdir(), "inframind-load-" + process.pid + ".bin");
const end = Date.now() + ${ms};
const writeSizeKB = ${writeSizeKB};
let written = 0;
let offset = 0;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const fd = fs.openSync(file, "w", 0o644);

function write() {
  if (Date.now() > end) {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(file); } catch {}
    console.log("[load] disk worker wrote", Math.round(written / 1024 / 1024), "MB total");
    process.exit(0);
  }
  try {
    const buf = Buffer.allocUnsafe(writeSizeKB * 1024);
    for (let i = 0; i < buf.length; i += 4096) buf[i] = Math.random() * 256;
    fs.writeSync(fd, buf, 0, buf.length, offset);
    fs.fsyncSync(fd);
    written += buf.length;
    offset += buf.length;
    if (offset >= MAX_FILE_SIZE) offset = 0;
  } catch (e) {}
  setImmediate(write);
}
write();
`;

  spawnWorker(workerCode, `disk-${Date.now()}`, ms);
}

function spawnNetworkLoad(ms: number, intensity: number) {
  // Make HTTP requests to localhost in a tight loop to generate network traffic.
  // Target the /api/v1/live endpoint which does the heaviest work (collects
  // system + processes + docker). The lo interface is included in /proc/net/dev
  // aggregation, so the traffic shows up in the network gauge.
  const port = process.env.PORT || '3003';
  const numWorkers = Math.max(3, Math.ceil(intensity * 8));
  console.log(`[load] Spawning ${numWorkers} network workers for ${ms}ms targeting port ${port}`);

  const workerCode = `
const http = require("http");
const end = Date.now() + ${ms};
let active = 0;
let completed = 0;
const MAX_CONCURRENT = 15;
const PORT = ${port};
function fire() {
  if (Date.now() > end) {
    if (active === 0) {
      console.log("[load] network worker completed", completed, "requests");
      process.exit(0);
    }
    return;
  }
  while (active < MAX_CONCURRENT) {
    active++;
    const req = http.get("http://localhost:" + PORT + "/api/v1/live", (res) => {
      res.resume();
      res.on("end", () => { active--; completed++; });
    });
    req.on("error", () => { active--; });
  }
  setImmediate(fire);
}
fire();
`;

  for (let i = 0; i < numWorkers; i++) {
    spawnWorker(workerCode, `network-${i}-${Date.now()}`, ms);
  }
}

export function startLoad(load: Omit<LoadProfile, 'startedAt' | 'expectedDurationMs'>): LoadProfile {
  const finalIntensity = Math.max(0.5, Math.min(1, Number(load.intensity ?? 0.8)));
  const finalDuration = Math.max(2, Math.min(10, Number(load.durationMin ?? 3)));
  const ms = finalDuration * 60 * 1000;

  const ld: LoadProfile = {
    ...load,
    intensity: finalIntensity,
    durationMin: finalDuration,
    startedAt: Date.now(),
    expectedDurationMs: ms,
  };
  activeLoads.push(ld);

  // Actually generate the load on this machine
  switch (ld.type) {
    case 'cpu':
      spawnCpuLoad(ms, finalIntensity);
      break;
    case 'memory':
      spawnMemoryLoad(ms, finalIntensity);
      break;
    case 'disk':
      spawnDiskLoad(ms, finalIntensity);
      break;
    case 'network':
      spawnNetworkLoad(ms, finalIntensity);
      break;
  }

  return ld;
}

export function activeLoadsFor(_host: string, now: number): LoadProfile[] {
  // Prune expired loads
  for (let i = activeLoads.length - 1; i >= 0; i--) {
    if (now - activeLoads[i].startedAt >= activeLoads[i].expectedDurationMs) {
      activeLoads.splice(i, 1);
    }
  }
  return [...activeLoads];
}

export function listActiveLoads(): LoadProfile[] {
  return activeLoadsFor('localhost', Date.now());
}

export const LOAD_DESCRIPTIONS: Record<LoadProfile['type'], (i: number, d: number) => string> = {
  cpu: (i, d) => `${i > 0.7 ? 'multi-core' : 'single-core'} CPU burn for ${d} min`,
  memory: (i, d) => `~${Math.floor(i * 512)}MB allocation held for ${d} min`,
  disk: (i, d) => `continuous ${Math.max(64, Math.floor(i * 512))}KB sync writes for ${d} min`,
  network: (i, d) => `${Math.max(3, Math.ceil(i * 8))} concurrent HTTP workers for ${d} min`,
};

export const EXPECTED_IMPACT: Record<LoadProfile['type'], string> = {
  cpu: 'CPU gauge should jump to 60-100% within 2-4 seconds',
  memory: 'Memory gauge should jump ~25% within 2-4 seconds',
  disk: 'Disk IO gauge (MB/s) should spike within 2-4 seconds',
  network: 'Network RX/TX gauges should spike within 2-4 seconds',
};
