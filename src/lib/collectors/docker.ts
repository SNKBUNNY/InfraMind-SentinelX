// Docker collector — real container telemetry via `docker ps` + `docker stats`.
// Gracefully degrades to "available: false" when Docker is absent or the daemon
// is not running. NEVER fabricates containers — that would defeat the purpose
// of having a real monitoring platform.

import { execSync } from 'child_process';
import { db } from '@/lib/db';

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string; // running / exited / paused / restarting
  cpuPercent: number;
  memoryUsedMB: number;
  memoryLimitMB: number;
  memoryPercent: number;
  netRxMB: number;
  netTxMB: number;
  blockReadMB: number;
  blockWriteMB: number;
  restartCount: number;
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  createdAt: string;
  startedAt: string;
}

export interface DockerAvailability {
  available: boolean;
  reason?: string;
  containers: DockerContainer[];
  version?: string;
  totalContainers?: number;
  runningContainers?: number;
}

function isDockerAvailable(): boolean {
  try {
    execSync('which docker', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isDockerDaemonRunning(): boolean {
  try {
    execSync('docker info', { encoding: 'utf-8', stdio: 'pipe', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function getDockerVersion(): string | undefined {
  try {
    const out = execSync('docker --version', { encoding: 'utf-8', stdio: 'pipe', timeout: 2000 });
    return out.trim();
  } catch {
    return undefined;
  }
}

function parseCpu(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/([\d.]+)%/);
  return m ? parseFloat(m[1]) : 0;
}

function parseSizeMB(s: string | undefined): number {
  if (!s) return 0;
  const m = s.match(/([\d.]+)\s*([A-Za-z]+)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === 'b') return n / (1024 * 1024);
  if (unit === 'kb' || unit === 'kib') return n / 1024;
  if (unit === 'mb' || unit === 'mib') return n;
  if (unit === 'gb' || unit === 'gib') return n * 1024;
  if (unit === 'tb' || unit === 'tib') return n * 1024 * 1024;
  return n;
}

function parseMem(s: string | undefined, pct: string | undefined): { used: number; limit: number; percent: number } {
  if (!s) return { used: 0, limit: 0, percent: 0 };
  const parts = s.split('/').map((x) => x.trim());
  const used = parseSizeMB(parts[0]);
  const limit = parts[1] ? parseSizeMB(parts[1]) : 0;
  const percent = pct ? parseFloat(pct.replace('%', '').trim()) || 0 : limit > 0 ? (used / limit) * 100 : 0;
  return { used, limit, percent };
}

function parseNet(s: string | undefined): { rxMB: number; txMB: number } {
  if (!s) return { rxMB: 0, txMB: 0 };
  const parts = s.split('/').map((x) => x.trim());
  return { rxMB: parseSizeMB(parts[0]), txMB: parseSizeMB(parts[1]) };
}

function parseBlock(s: string | undefined): { readMB: number; writeMB: number } {
  if (!s) return { readMB: 0, writeMB: 0 };
  const parts = s.split('/').map((x) => x.trim());
  return { readMB: parseSizeMB(parts[0]), writeMB: parseSizeMB(parts[1]) };
}

export function collectDocker(): DockerAvailability {
  if (!isDockerAvailable()) {
    return {
      available: false,
      reason:
        'Docker binary not found on this host. Install Docker (or Docker Desktop with WSL2 integration enabled on Windows) to enable container monitoring.',
      containers: [],
    };
  }
  if (!isDockerDaemonRunning()) {
    return {
      available: false,
      reason:
        'Docker daemon is not running. Start it with `sudo systemctl start docker` (Linux) or open Docker Desktop (Windows/WSL).',
      containers: [],
      version: getDockerVersion(),
    };
  }

  const version = getDockerVersion();

  let psOutput: string;
  try {
    psOutput = execSync(
      'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.CreatedAt}}|{{.RunningFor}}"',
      { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 },
    );
  } catch {
    return {
      available: false,
      reason:
        'Failed to list containers (permission denied? add user to docker group: `sudo usermod -aG docker $USER && newgrp docker`).',
      containers: [],
      version,
    };
  }

  const containers: DockerContainer[] = [];
  const lines = psOutput.trim().split('\n').filter(Boolean);

  // Live stats for running containers in one shot
  const statsMap = new Map<string, { cpu: string; mem: string; memPct: string; net: string; block: string }>();
  try {
    const stats = execSync(
      'docker stats --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}"',
      { encoding: 'utf-8', stdio: 'pipe', timeout: 10000 },
    );
    for (const line of stats.trim().split('\n').filter(Boolean)) {
      const [id, cpu, mem, memPct, net, block] = line.split('|');
      statsMap.set(id.trim(), {
        cpu: cpu || '',
        mem: mem || '',
        memPct: memPct || '',
        net: net || '',
        block: block || '',
      });
    }
  } catch {
    // docker stats can be slow/flaky — that's OK, we still list containers
  }

  for (const line of lines) {
    const [id, name, image, status, state, createdAt, runningFor] = line.split('|').map((x) => (x || '').trim());
    const stats = statsMap.get(id) ?? { cpu: '', mem: '', memPct: '', net: '', block: '' };
    const cpu = parseCpu(stats.cpu);
    const { used, limit, percent } = parseMem(stats.mem, stats.memPct);
    const { rxMB, txMB } = parseNet(stats.net);
    const { readMB, writeMB } = parseBlock(stats.block);

    // Try to get restart count + health via docker inspect (best-effort, optional)
    let restartCount = 0;
    let health: DockerContainer['health'] = 'none';
    try {
      const inspect = execSync(`docker inspect --format '{{.RestartCount}}|{{.State.Health.Status}}' ${id}`, {
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 2000,
      }).trim();
      const [rc, h] = inspect.split('|');
      restartCount = parseInt(rc) || 0;
      if (h && h !== '<no value>') health = h as DockerContainer['health'];
    } catch {
      // inspect is slow if there are many containers; skip on failure
    }

    containers.push({
      id,
      name,
      image,
      status,
      state,
      cpuPercent: cpu,
      memoryUsedMB: used,
      memoryLimitMB: limit,
      memoryPercent: percent,
      netRxMB: rxMB,
      netTxMB: txMB,
      blockReadMB: readMB,
      blockWriteMB: writeMB,
      restartCount,
      health,
      createdAt,
      startedAt: runningFor,
    });
  }

  return {
    available: true,
    containers,
    version,
    totalContainers: containers.length,
    runningContainers: containers.filter((c) => c.state === 'running').length,
  };
}

// Persist the latest container snapshot into Prisma so the dashboard can query
// historical states. Called from the orchestrator's tick().
export async function persistDockerSnapshot(): Promise<{ collected: number; upserted: number }> {
  const result = collectDocker();
  if (!result.available) return { collected: 0, upserted: 0 };

  for (const c of result.containers) {
    await db.container.upsert({
      where: { name: c.name },
      create: {
        name: c.name,
        image: c.image,
        status: c.status,
        health: c.health,
        cpu: c.cpuPercent,
        memory: c.memoryUsedMB,
        memoryLimit: c.memoryLimitMB,
        restartCount: c.restartCount,
        createdAt: c.createdAt,
        startedAt: c.startedAt ? new Date(c.startedAt) : null,
      },
      update: {
        image: c.image,
        status: c.status,
        health: c.health,
        cpu: c.cpuPercent,
        memory: c.memoryUsedMB,
        memoryLimit: c.memoryLimitMB,
        restartCount: c.restartCount,
        createdAt: c.createdAt,
        startedAt: c.startedAt ? new Date(c.startedAt) : null,
      },
    });
  }

  return { collected: result.containers.length, upserted: result.containers.length };
}
