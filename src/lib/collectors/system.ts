// Real Linux endpoint telemetry — reads from /proc, /sys, audit logs, network connections
import { readFileSync, existsSync, readdirSync } from 'fs';
import { hostname, cpus, loadavg, uptime as osUptime, platform, arch, totalmem, freemem, networkInterfaces } from 'os';
import { execSync } from 'child_process';

export interface SystemSnapshot {
  host: string;
  ts: string;
  cpuPercent: number;
  cpuCores: number;
  memoryUsedMB: number;
  memoryTotalMB: number;
  memoryPercent: number;
  swapUsedMB: number;
  swapTotalMB: number;
  diskPercent: number;
  diskUsedGB: number;
  diskTotalGB: number;
  diskReadMBps: number;
  diskWriteMBps: number;
  netRxMbps: number;
  netTxMbps: number;
  load1: number;
  load5: number;
  load15: number;
  processes: number;
  uptime: number;
}

let prevCpu: { idle: number; total: number } | null = null;
let prevDisk: { read: number; write: number; ts: number } | null = null;
let prevNet: { rx: number; tx: number; ts: number } | null = null;

function readProcStat() {
  try {
    if (!existsSync('/proc/stat')) {
      const cpuTimes = cpus().reduce((totals, cpu) => {
        totals.idle += cpu.times.idle;
        totals.total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
        return totals;
      }, { idle: 0, total: 0 });
      return cpuTimes;
    }
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
    const get = (k: string) => Number((text.match(new RegExp(`${k}:\\s+(\\d+)`)) || [])[1] || 0);
    const totalKB = get('MemTotal'); const availKB = get('MemAvailable') || get('MemFree');
    const swapTotalKB = get('SwapTotal'); const swapFreeKB = get('SwapFree');
    return { totalKB, usedKB: totalKB - availKB, swapTotalKB, swapUsedKB: swapTotalKB - swapFreeKB };
  } catch { return { totalKB: 0, usedKB: 0, swapTotalKB: 0, swapUsedKB: 0 }; }
}

function readProcDiskstats() {
  try {
    if (!existsSync('/proc/diskstats')) {
      const out = execSync(
        'powershell -NoProfile -Command "Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk | Select-Object Name,DiskReadBytesPerSec,DiskWriteBytesPerSec | ConvertTo-Json -Compress"',
        { encoding: 'utf8' },
      );
      const disks = JSON.parse(out.trim());
      const disk = Array.isArray(disks) ? disks.find((item) => item.Name === '_Total') : disks;
      return { read: Number(disk.DiskReadBytesPerSec) || 0, write: Number(disk.DiskWriteBytesPerSec) || 0 };
    }
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
    if (!existsSync('/proc/net/dev')) {
      const out = execSync(
        'powershell -NoProfile -Command "\'rx\'; (Get-NetAdapterStatistics | Measure-Object -Property ReceivedBytes -Sum).Sum; \'tx\'; (Get-NetAdapterStatistics | Measure-Object -Property SentBytes -Sum).Sum"',
        { encoding: 'utf8' },
      ).trim().split(/\r?\n/);
      return { rx: Number(out[1]) || 0, tx: Number(out[3]) || 0 };
    }
    const text = readFileSync('/proc/net/dev', 'utf8');
    let rx = 0, tx = 0;
    for (const line of text.split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;
      if (parts[0].replace(':', '') === 'lo') continue;
      rx += Number(parts[1]) || 0; tx += Number(parts[9]) || 0;
    }
    return { rx, tx };
  } catch { return null; }
}

function readDiskUsage() {
  try {
    let totalBytes: number;
    let usedBytes: number;
    if (platform() === 'win32') {
      const out = execSync(
        'powershell -NoProfile -Command "$d = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq \'C:\' }; $d | Select-Object Size,FreeSpace | ConvertTo-Json -Compress"',
        { encoding: 'utf8' },
      );
      const disk = JSON.parse(out.trim());
      totalBytes = Number(disk.Size) || 0;
      usedBytes = totalBytes - (Number(disk.FreeSpace) || 0);
    } else {
      const out = execSync('df -B1 / 2>/dev/null', { encoding: 'utf8' });
      const parts = out.split('\n')[1].trim().split(/\s+/);
      totalBytes = Number(parts[1]);
      usedBytes = Number(parts[2]);
    }
    return { percent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0, usedGB: usedBytes / 1024 / 1024 / 1024, totalGB: totalBytes / 1024 / 1024 / 1024 };
  } catch { return { percent: 0, usedGB: 0, totalGB: 0 }; }
}

function countProcesses() {
  try {
    if (platform() === 'win32') {
      return Number(execSync('powershell -NoProfile -Command "(Get-Process).Count"', { encoding: 'utf8' }).trim()) || 0;
    }
    return Number(execSync('ps -e 2>/dev/null | wc -l', { encoding: 'utf8' }).trim()) - 1;
  } catch { return 0; }
}

export function collectSystem(): SystemSnapshot {
  const now = Date.now();
  const cpu = readProcStat();
  let cpuPercent = 0;
  if (cpu && prevCpu) {
    const totalDiff = cpu.total - prevCpu.total;
    cpuPercent = totalDiff > 0 ? Math.min(100, Math.max(0, (1 - (cpu.idle - prevCpu.idle) / totalDiff) * 100)) : 0;
  }
  prevCpu = cpu;
  const mem = readProcMeminfo();
  const disk = readProcDiskstats();
  let diskReadMBps = 0, diskWriteMBps = 0;
  if (platform() === 'win32' && disk) {
    diskReadMBps = disk.read / 1e6;
    diskWriteMBps = disk.write / 1e6;
  } else if (disk && prevDisk) {
    const dt = (now - prevDisk.ts) / 1000;
    if (dt > 0) { diskReadMBps = (disk.read - prevDisk.read) / 1024 / 1024 / dt; diskWriteMBps = (disk.write - prevDisk.write) / 1024 / 1024 / dt; }
  }
  if (disk) prevDisk = { ...disk, ts: now };
  const net = readProcNetDev();
  let netRxMbps = 0, netTxMbps = 0;
  if (net && prevNet) {
    const dt = (now - prevNet.ts) / 1000;
    if (dt > 0) { netRxMbps = ((net.rx - prevNet.rx) / dt) * 8 / 1024 / 1024; netTxMbps = ((net.tx - prevNet.tx) / dt) * 8 / 1024 / 1024; }
  }
  if (net) prevNet = { ...net, ts: now };
  const du = readDiskUsage();
  const [load1, load5, load15] = loadavg();
  return {
    host: hostname(), ts: new Date(now).toISOString(),
    cpuPercent: Math.round(cpuPercent * 100) / 100, cpuCores: cpus().length,
    memoryUsedMB: Math.round(mem.usedKB / 1024), memoryTotalMB: Math.round(mem.totalKB / 1024),
    memoryPercent: mem.totalKB > 0 ? Math.round((mem.usedKB / mem.totalKB) * 10000) / 100 : 0,
    swapUsedMB: Math.round(mem.swapUsedKB / 1024), swapTotalMB: Math.round(mem.swapTotalKB / 1024),
    diskPercent: Math.round(du.percent * 100) / 100, diskUsedGB: Math.round(du.usedGB * 100) / 100, diskTotalGB: Math.round(du.totalGB * 100) / 100,
    diskReadMBps: Math.max(0, Math.round(diskReadMBps * 100) / 100), diskWriteMBps: Math.max(0, Math.round(diskWriteMBps * 100) / 100),
    netRxMbps: Math.max(0, Math.round(netRxMbps * 100) / 100), netTxMbps: Math.max(0, Math.round(netTxMbps * 100) / 100),
    load1: Math.round(load1 * 100) / 100, load5: Math.round(load5 * 100) / 100, load15: Math.round(load15 * 100) / 100,
    processes: countProcesses(), uptime: osUptime(),
  };
}

export function getPlatformInfo() {
  return { hostname: hostname(), platform: platform(), arch: arch(), uptime: osUptime() };
}

// Collect REAL security-relevant telemetry from the endpoint
export interface RealEndpointEvent {
  eventType: string; // process | network | file | authentication
  host: string;
  agentId: string;
  timestamp: string;
  rawData: Record<string, any>;
}

// Collect real process events (top processes by CPU, new processes, suspicious processes)
export function collectProcessEvents(): RealEndpointEvent[] {
  const events: RealEndpointEvent[] = [];
  const host = hostname();
  try {
    const out = execSync('ps -eo pid,comm,user,pcpu,pmem,rss,etime,args --sort=-pcpu 2>/dev/null | head -n 16', { encoding: 'utf8' });
    const lines = out.trim().split('\n').slice(1);
    const suspiciousNames = ['nc', 'ncat', 'netcat', 'nmap', 'masscan', 'hydra', 'john', 'hashcat', 'mimikatz', 'empire', 'metasploit', 'msfconsole'];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 7) continue;
      const pid = Number(parts[0]);
      const name = parts[1];
      const user = parts[2];
      const cpu = Number(parts[3]);
      const mem = Number(parts[4]);
      const rss = Number(parts[5]);
      const etime = parts[6];
      const cmdline = parts.slice(7).join(' ');
      const isSuspicious = suspiciousNames.some(s => name.toLowerCase().includes(s));
      if (cpu > 1 || isSuspicious || rss > 50000) {
        events.push({
          eventType: 'process',
          host,
          agentId: `linux-${host}`,
          timestamp: new Date().toISOString(),
          rawData: {
            pid, name, user, cpuPercent: cpu, memoryPercent: mem, rssMB: Math.round(rss / 1024),
            etime, cmdline: cmdline.substring(0, 200), isSuspicious,
            reason: isSuspicious ? 'suspicious_process_name' : cpu > 80 ? 'high_cpu' : 'high_memory',
          },
        });
      }
    }
  } catch {}
  return events;
}

// Collect real network connections (external IPs, established connections, listening ports)
export function collectNetworkEvents(): RealEndpointEvent[] {
  const events: RealEndpointEvent[] = [];
  const host = hostname();
  try {
    const out = execSync('ss -tunp 2>/dev/null | head -n 30', { encoding: 'utf8' });
    const lines = out.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const state = parts[0];
      const local = parts[4];
      const peer = parts[5];
      if (!peer || peer === '*') continue;
      const peerParts = peer.split(':');
      const peerIp = peerParts[0];
      const peerPort = Number(peerParts[1]);
      if (peerIp === '127.0.0.1' || peerIp === '::1' || peerIp.startsWith('10.') || peerIp.startsWith('192.168.') || peerIp.startsWith('172.')) continue;
      // External connection
      const suspiciousPorts = [4444, 4445, 6667, 9001, 9030, 9050, 9051, 9150, 3333, 5555, 7777];
      const isSuspicious = suspiciousPorts.includes(peerPort);
      events.push({
        eventType: 'network',
        host,
        agentId: `linux-${host}`,
        timestamp: new Date().toISOString(),
        rawData: {
          dstIp: peerIp, dstPort: peerPort, protocol: 'tcp', status: state,
          localAddr: local, isSuspicious, reason: isSuspicious ? 'suspicious_port' : 'external_connection',
        },
      });
      if (events.length > 10) break;
    }
  } catch {}
  return events;
}

// Collect real authentication events (from auth log or last command)
export function collectAuthEvents(): RealEndpointEvent[] {
  const events: RealEndpointEvent[] = [];
  const host = hostname();
  try {
    // Try reading last few login records
    const out = execSync('last -n 5 -w 2>/dev/null || echo ""', { encoding: 'utf8' });
    const lines = out.trim().split('\n').filter(l => l.trim() && !l.startsWith('wtmp'));
    for (const line of lines.slice(0, 5)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 4) continue;
      const user = parts[0];
      const terminal = parts[1];
      const ip = parts[2].includes(':') ? parts[2] : parts[3];
      events.push({
        eventType: 'authentication',
        host,
        agentId: `linux-${host}`,
        timestamp: new Date().toISOString(),
        rawData: {
          action: 'login_success', user, terminal, sourceIp: ip,
          reason: ip && !ip.startsWith('10.') && !ip.startsWith('192.168.') ? 'remote_login' : 'local_login',
        },
      });
    }
  } catch {}
  return events;
}

// Collect ALL real endpoint telemetry in one call
export function collectAllEndpointTelemetry(): RealEndpointEvent[] {
  return [...collectProcessEvents(), ...collectNetworkEvents(), ...collectAuthEvents()];
}