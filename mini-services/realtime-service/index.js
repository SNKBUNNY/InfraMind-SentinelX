// ============================================================================
// InfraMind-SentinelX Realtime Metrics Miniservice (Bun + WebSocket)
// ----------------------------------------------------------------------------
// Standalone Bun service that pushes real-time Ubuntu/WSL metrics to the
// dashboard via WebSocket on port 3001. Falls back gracefully on non-Linux.
//
// Run with:  bun run index.js   (or via `bun run realtime` from project root)
// ============================================================================

import { readFileSync, existsSync, readdirSync } from 'fs';
import { hostname, cpus, loadavg, uptime as osUptime, totalmem, freemem, platform } from 'os';
import { execSync } from 'child_process';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.REALTIME_PORT) || 3001;
const TICK_MS = 2000;

// ============================================================================
// Real /proc collectors — same logic as src/lib/collectors/system.ts
// (re-implemented inline because miniservices can't import Next.js code)
// ============================================================================

let prevCpu = null;
let prevDisk = null;
let prevNet = null;

function readProcStat() {
  try {
    if (!existsSync('/proc/stat')) return null;
    const line = readFileSync('/proc/stat', 'utf8').split('\n')[0];
    const parts = line.split(/\s+/);
    const [user, nice, system, idle, iowait, irq, softirq, steal] = parts.slice(1).map(Number);
    return { idle: idle + iowait, total: user + nice + system + idle + iowait + irq + softirq + steal };
  } catch { return null; }
}

function readProcMeminfo() {
  try {
    if (!existsSync('/proc/meminfo')) {
      const total = Math.floor(totalmem() / 1024);
      const used = Math.floor((totalmem() - freemem()) / 1024);
      return { totalKB: total, usedKB: used, swapTotalKB: 0, swapUsedKB: 0 };
    }
    const text = readFileSync('/proc/meminfo', 'utf8');
    const get = (k) => Number((text.match(new RegExp(`${k}:\\s+(\\d+)`)) || [])[1] || 0);
    const totalKB = get('MemTotal'); const availKB = get('MemAvailable') || get('MemFree');
    const swapTotalKB = get('SwapTotal'); const swapFreeKB = get('SwapFree');
    return { totalKB, usedKB: totalKB - availKB, swapTotalKB, swapUsedKB: swapTotalKB - swapFreeKB };
  } catch { return { totalKB: 0, usedKB: 0, swapTotalKB: 0, swapUsedKB: 0 }; }
}

function readProcDiskstats() {
  try {
    if (!existsSync('/proc/diskstats')) return null;
    const text = readFileSync('/proc/diskstats', 'utf8');
    let r = 0, w = 0;
    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 14) continue;
      if (/\d+$/.test(parts[2])) continue;
      r += Number(parts[5]) || 0; w += Number(parts[9]) || 0;
    }
    return { read: r * 512, write: w * 512 };
  } catch { return null; }
}

function readProcNetDev() {
  try {
    if (!existsSync('/proc/net/dev')) return null;
    const text = readFileSync('/proc/net/dev', 'utf8');
    let rx = 0, tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 11) continue;
      const iface = parts[0].replace(':', '');
      if (['lo', 'eth0', 'wlan0', 'enp0s3', 'ens33', 'docker0', 'br-'].some(p => iface.startsWith(p))) {
        rx += Number(parts[1]) || 0;
        tx += Number(parts[9]) || 0;
      }
    }
    return { rx, tx };
  } catch { return null; }
}

function readLoadAvg() {
  try {
    if (!existsSync('/proc/loadavg')) return { load1: loadavg()[0], load5: loadavg()[1], load15: loadavg()[2] };
    const text = readFileSync('/proc/loadavg', 'utf8');
    const parts = text.split(/\s+/);
    return { load1: Number(parts[0]), load5: Number(parts[1]), load15: Number(parts[2]) };
  } catch { return { load1: 0, load5: 0, load15: 0 }; }
}

function readProcessCount() {
  try {
    if (!existsSync('/proc')) return 0;
    return readdirSync('/proc').filter(d => /^\d+$/.test(d)).length;
  } catch { return 0; }
}

function getTopProcesses(limit = 8) {
  try {
    const out = execSync(`ps -eo pid,comm,user,pcpu,pmem,rss,args --sort=-pcpu 2>/dev/null | head -n ${limit + 1}`, { encoding: 'utf8' });
    return out.trim().split('\n').slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) return null;
      return {
        pid: Number(parts[0]),
        name: parts[1],
        user: parts[2],
        cpuPercent: Number(parts[3]) || 0,
        memoryPercent: Number(parts[4]) || 0,
        rssMB: Math.round((Number(parts[5]) || 0) / 1024),
        cmdline: parts.slice(6).join(' ').substring(0, 120),
      };
    }).filter(Boolean);
  } catch { return []; }
}

function isDockerAvailable() {
  try { execSync('which docker', { encoding: 'utf-8', stdio: 'pipe' }); return true; } catch { return false; }
}
function isDockerRunning() {
  try { execSync('docker info', { encoding: 'utf-8', stdio: 'pipe', timeout: 3000 }); return true; } catch { return false; }
}

function collectDockerContainers() {
  if (!isDockerAvailable() || !isDockerRunning()) return null;
  try {
    const ps = execSync('docker ps --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}"', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
    const containers = [];
    let statsMap = new Map();
    try {
      const stats = execSync('docker stats --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}"', { encoding: 'utf-8', stdio: 'pipe', timeout: 8000 });
      for (const line of stats.trim().split('\n').filter(Boolean)) {
        const [id, cpu, mem, memPct] = line.split('|');
        statsMap.set(id.trim(), { cpu, mem, memPct });
      }
    } catch {}
    for (const line of ps.trim().split('\n').filter(Boolean)) {
      const [id, name, image, status, state] = line.split('|');
      const s = statsMap.get(id.trim()) ?? {};
      containers.push({
        id: id.trim(), name: name.trim(), image: image.trim(),
        status: status.trim(), state: state.trim(),
        cpu: parseFloat(s.cpu?.replace('%', '') ?? '0') || 0,
        memoryMB: parseFloat((s.mem || '').split('/')[0]?.trim() || '0') || 0,
        memoryPercent: parseFloat(s.memPct?.replace('%', '') ?? '0') || 0,
      });
    }
    return containers;
  } catch { return null; }
}

// ============================================================================
// Take a complete snapshot
// ============================================================================

function takeSnapshot() {
  const now = Date.now();
  const cpu = readProcStat();
  let cpuPercent = 0;
  if (prevCpu && cpu) {
    const totalDelta = cpu.total - prevCpu.total;
    const idleDelta = cpu.idle - prevCpu.idle;
    if (totalDelta > 0) cpuPercent = Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100));
  }
  if (cpu) prevCpu = { idle: cpu.idle, total: cpu.total };

  const mem = readProcMeminfo();
  const memoryUsedMB = Math.round(mem.usedKB / 1024);
  const memoryTotalMB = Math.round(mem.totalKB / 1024);
  const memoryPercent = mem.totalKB > 0 ? Math.round((mem.usedKB / mem.totalKB) * 1000) / 10 : 0;

  // Disk usage
  let diskPercent = 0, diskUsedGB = 0, diskTotalGB = 0;
  try {
    const df = execSync('df -B1 / 2>/dev/null', { encoding: 'utf8' }).trim().split('\n')[1]?.split(/\s+/);
    if (df && df.length >= 6) {
      diskTotalGB = Math.round(Number(df[1]) / 1024 / 1024 / 1024 * 10) / 10;
      diskUsedGB = Math.round(Number(df[2]) / 1024 / 1024 / 1024 * 10) / 10;
      diskPercent = Math.round((Number(df[2]) / Number(df[1])) * 1000) / 10;
    }
  } catch {}

  // Disk IO rate
  const diskIO = readProcDiskstats();
  let diskReadMBps = 0, diskWriteMBps = 0;
  if (prevDisk && diskIO) {
    const dt = (now - prevDisk.ts) / 1000;
    if (dt > 0) {
      diskReadMBps = Math.max(0, (diskIO.read - prevDisk.read) / 1e6 / dt);
      diskWriteMBps = Math.max(0, (diskIO.write - prevDisk.write) / 1e6 / dt);
    }
  }
  if (diskIO) prevDisk = { read: diskIO.read, write: diskIO.write, ts: now };

  // Network rate
  const net = readProcNetDev();
  let netRxMbps = 0, netTxMbps = 0;
  if (prevNet && net) {
    const dt = (now - prevNet.ts) / 1000;
    if (dt > 0) {
      netRxMbps = Math.max(0, (net.rx - prevNet.rx) * 8 / 1e6 / dt);
      netTxMbps = Math.max(0, (net.tx - prevNet.tx) * 8 / 1e6 / dt);
    }
  }
  if (net) prevNet = { rx: net.rx, tx: net.tx, ts: now };

  const load = readLoadAvg();
  const processes = readProcessCount();
  const topProcesses = getTopProcesses(8);
  const docker = collectDockerContainers();

  return {
    host: hostname(),
    ts: new Date().toISOString(),
    platform: platform(),
    uptime: osUptime(),
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    cpuCores: cpus().length,
    memoryUsedMB, memoryTotalMB, memoryPercent,
    swapUsedMB: Math.round(mem.swapUsedKB / 1024),
    swapTotalMB: Math.round(mem.swapTotalKB / 1024),
    diskPercent, diskUsedGB, diskTotalGB,
    diskReadMBps: Math.round(diskReadMBps * 100) / 100,
    diskWriteMBps: Math.round(diskWriteMBps * 100) / 100,
    netRxMbps: Math.round(netRxMbps * 100) / 100,
    netTxMbps: Math.round(netTxMbps * 100) / 100,
    load1: load.load1, load5: load.load5, load15: load.load15,
    processes,
    topProcesses,
    dockerAvailable: !!docker,
    dockerContainers: docker || [],
    source: 'realtime-service',
  };
}

// ============================================================================
// HTTP + WebSocket server
// ============================================================================

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, port: PORT, time: new Date().toISOString(), service: 'inframind-realtime' }));
    return;
  }
  if (req.url === '/snapshot') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(takeSnapshot()));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server, path: '/ws' });

const connectedClients = new Set();
let lastStatus = null;

wss.on('connection', (ws) => {
  connectedClients.add(ws);
  console.log(`[realtime] Client connected. Total: ${connectedClients.size}`);

  // Send immediate snapshot
  try {
    const snap = takeSnapshot();
    ws.send(JSON.stringify({ type: 'tick', data: snap }));
    const status = { dockerAvailable: snap.dockerAvailable };
    if (!lastStatus || lastStatus.dockerAvailable !== status.dockerAvailable) {
      ws.send(JSON.stringify({ type: 'status', data: status }));
    }
  } catch (e) {
    console.error('[realtime] initial send error:', e.message);
  }

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log(`[realtime] Client disconnected. Total: ${connectedClients.size}`);
  });

  ws.on('error', () => {
    connectedClients.delete(ws);
  });
});

// Tick every TICK_MS — broadcast to all clients
setInterval(() => {
  if (connectedClients.size === 0) return;
  try {
    const snap = takeSnapshot();
    const status = { dockerAvailable: snap.dockerAvailable };
    if (!lastStatus || lastStatus.dockerAvailable !== status.dockerAvailable) {
      const msg = JSON.stringify({ type: 'status', data: status });
      for (const c of connectedClients) { try { c.send(msg); } catch {} }
      lastStatus = status;
    }
    const msg = JSON.stringify({ type: 'tick', data: snap });
    for (const c of connectedClients) { try { c.send(msg); } catch {} }
  } catch (e) {
    console.error('[realtime] tick error:', e.message);
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log(`[realtime] Listening on http://localhost:${PORT}  (ws://localhost:${PORT}/ws)`);
  console.log(`[realtime] Health:  http://localhost:${PORT}/health`);
  console.log(`[realtime] Snapshot: http://localhost:${PORT}/snapshot`);
  console.log(`[realtime] Tick interval: ${TICK_MS}ms`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[realtime] SIGTERM received, shutting down...');
  for (const c of connectedClients) { try { c.close(); } catch {} }
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('[realtime] SIGINT received, shutting down...');
  for (const c of connectedClients) { try { c.close(); } catch {} }
  server.close(() => process.exit(0));
});
