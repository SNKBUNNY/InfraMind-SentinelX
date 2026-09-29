// SentinelX Linux collectors — file integrity, USB, registry-equivalent (config
// files), system metrics. Ported from SentinelX's Windows-specific agent to
// Linux/WSL using /proc, fs.watch, and lsblk.
//
// Pattern: each collector returns a list of RealEndpointEvent records. The
// orchestrator pushes them through the existing threat-engine + policy-compiler
// pipeline so incidents are auto-created when threatScore >= 40.

import { execSync } from 'child_process';
import { existsSync, readFileSync, statSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';

const HOST = (() => {
  try {
    return hostname() || 'localhost';
  } catch {
    return 'localhost';
  }
})();

export interface SentinelXEvent {
  eventType: 'file' | 'process' | 'network' | 'system' | 'usb' | 'registry' | 'authentication';
  host: string;
  agentId: string;
  timestamp: string;
  rawData: Record<string, any>;
}

// ---------- File integrity monitoring (Linux port) ----------
// On Windows SentinelX uses watchdog. On Linux we use chokidar-equivalent
// behaviour: snapshot known files and detect changes via mtime + size.
// A long-running watcher would be better but doesn't fit Next.js request
// lifecycle — we snapshot on each cycle and emit `file` events for changed
// files in monitored paths.

const FILE_MONITOR_PATHS = [
  '/etc/passwd',
  '/etc/shadow',
  '/etc/sudoers',
  '/etc/ssh/sshd_config',
  '/etc/crontab',
  '/etc/hosts',
  '/etc/resolv.conf',
  '/home',
];

const fileSnapshots = new Map<string, { mtime: number; size: number }>();

export function collectFileEvents(): SentinelXEvent[] {
  const events: SentinelXEvent[] = [];
  const seen = new Set<string>();

  for (const dir of FILE_MONITOR_PATHS) {
    if (!existsSync(dir)) continue;
    try {
      const stat = statSync(dir);
      if (stat.isFile()) {
        const key = dir;
        seen.add(key);
        const mtime = stat.mtimeMs;
        const size = stat.size;
        const prev = fileSnapshots.get(key);
        if (prev && (prev.mtime !== mtime || prev.size !== size)) {
          events.push({
            eventType: 'file',
            host: HOST,
            agentId: `linux-${HOST}`,
            timestamp: new Date().toISOString(),
            rawData: {
              action: 'modified',
              file_path: dir,
              file: dir,
              file_extension: dir.substring(dir.lastIndexOf('.')),
              process_name: 'unknown',
              size,
              prevSize: prev.size,
              reason: 'config_file_modified',
            },
          });
        }
        fileSnapshots.set(key, { mtime, size });
      }
    } catch {
      // permission denied — skip
    }
  }

  // Prune missing files
  for (const key of fileSnapshots.keys()) {
    if (!seen.has(key) && !FILE_MONITOR_PATHS.includes(key)) {
      fileSnapshots.delete(key);
    }
  }

  return events;
}

// ---------- USB device monitoring (Linux port) ----------
// SentinelX uses psutil.disk_partitions on Windows. On Linux we read
// /proc/mounts and detect removable/USB devices by filesystem type.

const usbSnapshots = new Set<string>();

export function collectUSBEvents(): SentinelXEvent[] {
  const events: SentinelXEvent[] = [];
  const current = new Set<string>();

  try {
    if (!existsSync('/proc/mounts')) return events;
    const mounts = readFileSync('/proc/mounts', 'utf8').split('\n');
    for (const line of mounts) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const device = parts[0];
      const mountPoint = parts[1];
      const fsType = parts[2];
      // USB/removable heuristics: /dev/sd* or vfat/exfat on /media or /mnt
      const isUsb =
        /^\/dev\/sd[a-z]/.test(device) ||
        /^\/dev\/mmcblk/.test(device) ||
        (mountPoint.startsWith('/media/') || mountPoint.startsWith('/mnt/')) &&
          ['vfat', 'exfat', 'ntfs', 'fuseblk'].includes(fsType);
      if (isUsb) {
        current.add(device);
        if (!usbSnapshots.has(device)) {
          events.push({
            eventType: 'usb',
            host: HOST,
            agentId: `linux-${HOST}`,
            timestamp: new Date().toISOString(),
            rawData: {
              device,
              mountPoint,
              fsType,
              action: 'inserted',
              status: 'mounted',
              reason: 'usb_device_inserted',
            },
          });
        }
      }
    }
  } catch {
    // ignore
  }

  // Detect removed devices
  for (const dev of usbSnapshots) {
    if (!current.has(dev)) {
      events.push({
        eventType: 'usb',
        host: HOST,
        agentId: `linux-${HOST}`,
        timestamp: new Date().toISOString(),
        rawData: {
          device: dev,
          action: 'removed',
          status: 'unmounted',
          reason: 'usb_device_removed',
        },
      });
    }
  }
  // Update snapshot
  usbSnapshots.clear();
  for (const dev of current) usbSnapshots.add(dev);

  return events;
}

// ---------- Registry-equivalent monitoring (Linux port) ----------
// SentinelX watches HKCU\\...\\Run on Windows. On Linux the equivalent
// persistence locations are systemd unit files, bashrc, crontab, profile.
// We snapshot these files and emit `registry` events for changes.

const REGISTRY_PATHS = [
  '/etc/systemd/system',
  '/etc/init.d',
  '/home/*/.bashrc',
  '/home/*/.profile',
  '/etc/cron.d',
  '/var/spool/cron/crontabs',
];

const regSnapshots = new Map<string, { mtime: number; size: number }>();

export function collectRegistryEvents(): SentinelXEvent[] {
  const events: SentinelXEvent[] = [];

  const checkFile = (path: string, hive: string) => {
    try {
      if (!existsSync(path)) return;
      const stat = statSync(path);
      const mtime = stat.mtimeMs;
      const size = stat.size;
      const prev = regSnapshots.get(path);
      if (prev && (prev.mtime !== mtime || prev.size !== size)) {
        events.push({
          eventType: 'registry',
          host: HOST,
          agentId: `linux-${HOST}`,
          timestamp: new Date().toISOString(),
          rawData: {
            hive,
            key: path,
            value: 'modified',
            data: `${size} bytes`,
            action: 'set-value',
            actor: 'unknown',
            reason: 'persistence_location_modified',
          },
        });
      }
      regSnapshots.set(path, { mtime, size });
    } catch {
      // skip
    }
  };

  for (const path of REGISTRY_PATHS) {
    if (path.includes('*')) {
      // Glob expand
      try {
        const base = path.split('*')[0];
        if (!existsSync(base)) continue;
        const { readdirSync } = require('fs');
        for (const entry of readdirSync(base)) {
          checkFile(join(base, entry), path.includes('bashrc') ? 'HKCU' : 'HKLM');
        }
      } catch {
        // ignore
      }
    } else {
      checkFile(path, 'HKLM');
    }
  }

  return events;
}

// ---------- Suspicious process detection (Linux) ----------
// SentinelX uses psutil. On Linux we exec `ps` and parse — same logic
// as the existing system.ts collectProcessEvents but returns SentinelXEvent
// shape compatible with the policy compiler's `process.name` field.

const SUSPICIOUS_PROCESS_NAMES = [
  'vssadmin',
  'cipher',
  'wbadmin',
  'bcdedit',
  'mimikatz',
  'nmap',
  'nc',
  'ncat',
  'hydra',
  'john',
  'hashcat',
  'masscan',
  'metasploit',
  'msfconsole',
  'empire',
  'powershell',
  'cmd.exe',
];

export function collectSuspiciousProcessEvents(): SentinelXEvent[] {
  const events: SentinelXEvent[] = [];
  try {
    const out = execSync('ps -eo pid,comm,user,pcpu,pmem,rss,args --sort=-pcpu 2>/dev/null | head -n 20', {
      encoding: 'utf8',
    });
    const lines = out.trim().split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 6) continue;
      const pid = Number(parts[0]);
      const name = parts[1].toLowerCase();
      const user = parts[2];
      const cpu = Number(parts[3]);
      const mem = Number(parts[4]);
      const rss = Number(parts[5]);
      const cmdline = parts.slice(6).join(' ');
      const isSuspicious = SUSPICIOUS_PROCESS_NAMES.some((s) => name.includes(s));
      const isEncodedPs = cmdline.toLowerCase().includes('encodedcommand') || cmdline.toLowerCase().includes(' -enc ');
      if (isSuspicious || isEncodedPs || cpu > 90 || rss > 500000) {
        events.push({
          eventType: 'process',
          host: HOST,
          agentId: `linux-${HOST}`,
          timestamp: new Date().toISOString(),
          rawData: {
            pid,
            name,
            user,
            cmdline: cmdline.substring(0, 200),
            cpu_percent: cpu,
            memory_mb: Math.round(rss / 1024),
            is_suspicious_name: isSuspicious,
            reason: isSuspicious
              ? 'suspicious_process_name'
              : isEncodedPs
                ? 'encoded_powershell'
                : cpu > 90
                  ? 'high_cpu'
                  : 'high_memory',
          },
        });
      }
    }
  } catch {
    // ignore
  }
  return events;
}

// ---------- External network connections (Linux) ----------
// SentinelX uses psutil.net_connections. On Linux we exec `ss` and filter
// for external IPs (matches system.ts but with SentinelX event shape).

const SUSPICIOUS_PORTS = [4444, 4445, 6667, 9001, 9030, 9050, 9051, 9150, 1337, 31337];

export function collectExternalNetworkEvents(): SentinelXEvent[] {
  const events: SentinelXEvent[] = [];
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
      if (peerIp === '127.0.0.1' || peerIp === '::1') continue;
      if (peerIp.startsWith('10.') || peerIp.startsWith('192.168.') || peerIp.startsWith('172.')) continue;
      const isSuspicious = SUSPICIOUS_PORTS.includes(peerPort);
      events.push({
        eventType: 'network',
        host: HOST,
        agentId: `linux-${HOST}`,
        timestamp: new Date().toISOString(),
        rawData: {
          dst_ip: peerIp,
          dstIp: peerIp,
          port: peerPort,
          dstPort: peerPort,
          protocol: 'tcp',
          status: state,
          local_addr: local,
          is_suspicious: isSuspicious,
          reason: isSuspicious ? 'suspicious_port' : 'external_connection',
        },
      });
      if (events.length >= 10) break;
    }
  } catch {
    // ignore
  }
  return events;
}

// ---------- Aggregate all SentinelX events ----------
export function collectAllSentinelXEvents(): SentinelXEvent[] {
  return [
    ...collectFileEvents(),
    ...collectUSBEvents(),
    ...collectRegistryEvents(),
    ...collectSuspiciousProcessEvents(),
    ...collectExternalNetworkEvents(),
  ];
}
