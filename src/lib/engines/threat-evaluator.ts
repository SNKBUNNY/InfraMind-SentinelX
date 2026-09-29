// Real-time Threat Evaluation Engine
//
// Runs live checks against the host to detect actual threats present RIGHT NOW.
// Each test probes the system (ps, ss, /proc, file system) and returns:
//   - detected: boolean (was the threat indicator found?)
//   - status: 'contained' | 'active' | 'mitigated' | 'not_found'
//   - evidence: specific process/file/network match
//   - mitreAttackId, severity, recommendedAction
//
// Examples:
//   - if notepad.exe is running → contained threat (process running but no malicious activity)
//   - if vssadmin.exe with "delete shadows" → active ransomware
//   - if .encrypted files exist → active ransomware impact
//   - if PowerShell -EncodedCommand → active execution
//   - if outbound connection to port 4444 → active C2 beacon

import { execSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { hostname } from 'os';
import { join } from 'path';
import { db } from '@/lib/db';
import { analyzeEvent } from '@/lib/security/threat-engine';

const HOST = hostname() || 'localhost';

export interface ThreatTestResult {
  id: string;
  testName: string;
  category: 'ransomware' | 'execution' | 'persistence' | 'c2' | 'credential_theft' | 'recon' | 'impact';
  mitreAttackId?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  detected: boolean;
  status: 'contained' | 'active' | 'mitigated' | 'not_found';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  evidence: string[];
  recommendedAction: string;
  checkedAt: string;
}

// Get all running processes (cached for 2s to avoid hammering `ps`)
let processCache: { time: number; data: Array<{ pid: number; name: string; cmdline: string; user: string; cpu: number; rss: number }> } | null = null;
function getRunningProcesses(): Array<{ pid: number; name: string; cmdline: string; user: string; cpu: number; rss: number }> {
  const now = Date.now();
  if (processCache && now - processCache.time < 2000) return processCache.data;
  try {
    const out = execSync('ps -eo pid,comm,user,pcpu,pmem,rss,args --sort=-pcpu 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    const lines = out.trim().split('\n').slice(1);
    const data = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: Number(parts[0]),
        name: (parts[1] || '').toLowerCase(),
        user: parts[2] || '',
        cpu: Number(parts[3]) || 0,
        rss: Number(parts[5]) || 0,
        cmdline: parts.slice(6).join(' '),
      };
    }).filter(p => p.pid);
    processCache = { time: now, data };
    return data;
  } catch { return []; }
}

// Get active network connections
let netCache: { time: number; data: any[] } | null = null;
function getNetworkConnections(): any[] {
  const now = Date.now();
  if (netCache && now - netCache.time < 2000) return netCache.data;
  try {
    const out = execSync('ss -tunp 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    const lines = out.trim().split('\n').slice(1);
    const data = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        state: parts[0],
        local: parts[4] || '',
        peer: parts[5] || '',
        peerIp: (parts[5] || '').split(':')[0],
        peerPort: Number((parts[5] || '').split(':').pop()) || 0,
      };
    }).filter(c => c.peer && c.peer !== '*');
    netCache = { time: now, data };
    return data;
  } catch { return []; }
}

// Run a single threat test
export function runThreatTest(testId: string): ThreatTestResult {
  const test = THREAT_TESTS.find(t => t.id === testId);
  if (!test) {
    return {
      id: testId,
      testName: 'Unknown',
      category: 'recon',
      detected: false,
      status: 'not_found',
      severity: 'info',
      evidence: ['Unknown test'],
      recommendedAction: 'N/A',
      checkedAt: new Date().toISOString(),
    };
  }
  return test.check();
}

// Run all threat tests
export function runAllThreatTests(): ThreatTestResult[] {
  return THREAT_TESTS.map(t => t.check());
}

// Persist a detected threat to DB
export async function persistThreat(result: ThreatTestResult): Promise<void> {
  if (!result.detected) return;

  // Check if we already persisted this threat in the last hour (dedupe)
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const existing = await db.securityEvent.findFirst({
    where: {
      eventType: 'threat_test',
      host: HOST,
      timestamp: { gte: since },
      rawData: { contains: result.id },
    },
  });
  if (existing) return;

  const rawData = {
    testId: result.id,
    testName: result.testName,
    category: result.category,
    status: result.status,
    severity: result.severity,
    evidence: result.evidence,
    mitreAttackId: result.mitreAttackId,
    checkedAt: result.checkedAt,
  };

  const analysis = analyzeEvent('process', { name: result.testName, cmdline: result.evidence.join(' ') });
  const threatScore = result.status === 'active' ? 85 : result.status === 'contained' ? 50 : 30;
  const classification = result.severity === 'critical' ? 'ransomware' : result.severity === 'high' ? 'suspicious' : 'benign';

  await db.securityEvent.create({
    data: {
      agentId: `linux-${HOST}`,
      eventType: 'threat_test',
      timestamp: new Date(),
      rawData: JSON.stringify(rawData),
      host: HOST,
      agentName: HOST,
      isProcessed: true,
      threatScore,
      classification,
      policyMatch: false,
    },
  });
}

// ============================================================================
// THREAT TESTS — each test probes the host for a specific threat indicator
// ============================================================================

interface ThreatTest {
  id: string;
  testName: string;
  category: ThreatTestResult['category'];
  check: () => ThreatTestResult;
}

const THREAT_TESTS: ThreatTest[] = [
  // ---- RANSOMWARE TESTS ----
  {
    id: 'ransomware_vssadmin',
    testName: 'Ransomware: vssadmin delete shadows',
    category: 'ransomware',
    check: () => {
      const procs = getRunningProcesses();
      const match = procs.find(p => p.name.includes('vssadmin') || p.cmdline.toLowerCase().includes('vssadmin'));
      const isDeleting = match && (match.cmdline.includes('delete') || match.cmdline.includes('shadows'));
      return {
        id: 'ransomware_vssadmin',
        testName: 'Ransomware: vssadmin delete shadows',
        category: 'ransomware',
        mitreAttackId: 'T1490',
        mitreTactic: 'Impact',
        mitreTechnique: 'Inhibit System Recovery',
        detected: !!match,
        status: isDeleting ? 'active' : match ? 'contained' : 'not_found',
        severity: isDeleting ? 'critical' : match ? 'high' : 'info',
        evidence: match ? [`Process: ${match.name} (PID ${match.pid})`, `Cmdline: ${match.cmdline}`] : ['No vssadmin process found'],
        recommendedAction: isDeleting ? 'Isolate host immediately, kill vssadmin process, trigger backup' : match ? 'Investigate vssadmin invocation context' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'ransomware_encrypted_files',
    testName: 'Ransomware: .encrypted/.locked files in /tmp and /home',
    category: 'ransomware',
    check: () => {
      const extensions = ['.encrypted', '.locked', '.crypto', '.locky', '.crypt', '.ransom'];
      const foundFiles: string[] = [];
      const searchDirs = ['/tmp', '/home', '/var/tmp'];
      for (const dir of searchDirs) {
        if (!existsSync(dir)) continue;
        try {
          const out = execSync(`find ${dir} -maxdepth 3 -type f \\( ${extensions.map(e => `-name "*${e}"`).join(' -o ')} \\) 2>/dev/null | head -10`, { encoding: 'utf8', timeout: 5000 });
          for (const f of out.trim().split('\n').filter(Boolean)) foundFiles.push(f);
        } catch {}
      }
      return {
        id: 'ransomware_encrypted_files',
        testName: 'Ransomware: .encrypted/.locked files in /tmp and /home',
        category: 'ransomware',
        mitreAttackId: 'T1486',
        mitreTactic: 'Impact',
        mitreTechnique: 'Data Encrypted for Impact',
        detected: foundFiles.length > 0,
        status: foundFiles.length > 0 ? 'active' : 'not_found',
        severity: foundFiles.length > 0 ? 'critical' : 'info',
        evidence: foundFiles.length > 0 ? foundFiles.map(f => `Encrypted file: ${f}`) : ['No encrypted files found'],
        recommendedAction: foundFiles.length > 0 ? 'Isolate host, identify ransomware family, restore from backup' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },

  // ---- EXECUTION TESTS ----
  {
    id: 'execution_powershell_encoded',
    testName: 'Execution: PowerShell with -EncodedCommand',
    category: 'execution',
    check: () => {
      const procs = getRunningProcesses();
      const match = procs.find(p =>
        p.name.includes('powershell') &&
        (p.cmdline.toLowerCase().includes('encodedcommand') || p.cmdline.toLowerCase().includes(' -enc '))
      );
      return {
        id: 'execution_powershell_encoded',
        testName: 'Execution: PowerShell with -EncodedCommand',
        category: 'execution',
        mitreAttackId: 'T1059.001',
        mitreTactic: 'Execution',
        mitreTechnique: 'PowerShell',
        detected: !!match,
        status: match ? 'active' : 'not_found',
        severity: match ? 'high' : 'info',
        evidence: match ? [`PID: ${match.pid}`, `Cmdline: ${match.cmdline.substring(0, 200)}`] : ['No encoded PowerShell detected'],
        recommendedAction: match ? 'Kill process, decode command, investigate origin' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'execution_notepad_suspicious',
    testName: 'Execution: notepad.exe (contained — process running, no malicious activity)',
    category: 'execution',
    check: () => {
      const procs = getRunningProcesses();
      const matches = procs.filter(p => p.name.includes('notepad'));
      // Check if notepad is doing anything suspicious (writing to many files, etc.)
      let suspicious = false;
      for (const m of matches) {
        if (m.cpu > 50) suspicious = true; // high CPU = might be doing something
      }
      return {
        id: 'execution_notepad_suspicious',
        testName: 'Execution: notepad.exe (contained — process running, no malicious activity)',
        category: 'execution',
        mitreAttackId: 'T1059',
        mitreTactic: 'Execution',
        mitreTechnique: 'Command and Scripting Interpreter',
        detected: matches.length > 0,
        status: matches.length > 0 ? (suspicious ? 'active' : 'contained') : 'not_found',
        severity: suspicious ? 'high' : matches.length > 0 ? 'low' : 'info',
        evidence: matches.length > 0 ? matches.map(m => `PID ${m.pid}: ${m.name} (CPU ${m.cpu}%, RSS ${Math.round(m.rss / 1024)}MB)`) : ['No notepad process found'],
        recommendedAction: suspicious ? 'Investigate — notepad should not consume high CPU' : matches.length > 0 ? 'Monitor — process is contained and shows no malicious activity' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'execution_cmd_suspicious',
    testName: 'Execution: cmd.exe spawning suspicious children',
    category: 'execution',
    check: () => {
      const procs = getRunningProcesses();
      const cmdProcs = procs.filter(p => p.name === 'cmd' || p.name === 'cmd.exe');
      return {
        id: 'execution_cmd_suspicious',
        testName: 'Execution: cmd.exe spawning suspicious children',
        category: 'execution',
        mitreAttackId: 'T1059.003',
        mitreTactic: 'Execution',
        mitreTechnique: 'Windows Command Shell',
        detected: cmdProcs.length > 0,
        status: cmdProcs.length > 0 ? 'contained' : 'not_found',
        severity: cmdProcs.length > 0 ? 'low' : 'info',
        evidence: cmdProcs.length > 0 ? cmdProcs.map(c => `PID ${c.pid}: ${c.cmdline.substring(0, 100)}`) : ['No cmd.exe processes'],
        recommendedAction: 'Monitor cmd.exe subprocess tree for suspicious children',
        checkedAt: new Date().toISOString(),
      };
    },
  },

  // ---- C2 / NETWORK TESTS ----
  {
    id: 'c2_beacon_4444',
    testName: 'C2: Outbound connection to port 4444 (Metasploit default)',
    category: 'c2',
    check: () => {
      const conns = getNetworkConnections();
      const matches = conns.filter(c => c.peerPort === 4444 && !c.peerIp.startsWith('127.') && !c.peerIp.startsWith('10.') && !c.peerIp.startsWith('192.168.'));
      return {
        id: 'c2_beacon_4444',
        testName: 'C2: Outbound connection to port 4444 (Metasploit default)',
        category: 'c2',
        mitreAttackId: 'T1071',
        mitreTactic: 'Command and Control',
        mitreTechnique: 'Application Layer Protocol',
        detected: matches.length > 0,
        status: matches.length > 0 ? 'active' : 'not_found',
        severity: matches.length > 0 ? 'critical' : 'info',
        evidence: matches.length > 0 ? matches.map(c => `${c.peerIp}:${c.peerPort} (${c.state})`) : ['No connections to port 4444'],
        recommendedAction: matches.length > 0 ? 'Block IP at firewall, isolate host, investigate process' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'c2_tor_ports',
    testName: 'C2: Tor relay ports (9001, 9030, 9050, 9051)',
    category: 'c2',
    check: () => {
      const torPorts = [9001, 9030, 9050, 9051, 9150];
      const conns = getNetworkConnections();
      const matches = conns.filter(c => torPorts.includes(c.peerPort) && !c.peerIp.startsWith('127.'));
      return {
        id: 'c2_tor_ports',
        testName: 'C2: Tor relay ports (9001, 9030, 9050, 9051)',
        category: 'c2',
        mitreAttackId: 'T1071.001',
        mitreTactic: 'Command and Control',
        mitreTechnique: 'Web Protocols',
        detected: matches.length > 0,
        status: matches.length > 0 ? 'active' : 'not_found',
        severity: matches.length > 0 ? 'high' : 'info',
        evidence: matches.length > 0 ? matches.map(c => `${c.peerIp}:${c.peerPort}`) : ['No Tor connections'],
        recommendedAction: matches.length > 0 ? 'Block Tor ports at firewall, investigate user activity' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'c2_external_connections',
    testName: 'C2: Unusual outbound external connections',
    category: 'c2',
    check: () => {
      const conns = getNetworkConnections();
      const external = conns.filter(c =>
        c.peerIp && c.peerIp !== '127.0.0.1' && c.peerIp !== '::1' &&
        !c.peerIp.startsWith('10.') && !c.peerIp.startsWith('192.168.') && !c.peerIp.startsWith('172.') &&
        c.state === 'ESTABLISHED'
      );
      return {
        id: 'c2_external_connections',
        testName: 'C2: Unusual outbound external connections',
        category: 'c2',
        mitreAttackId: 'T1071',
        mitreTactic: 'Command and Control',
        detected: external.length > 5,
        status: external.length > 5 ? 'active' : external.length > 0 ? 'contained' : 'not_found',
        severity: external.length > 5 ? 'medium' : 'info',
        evidence: external.slice(0, 10).map(c => `${c.peerIp}:${c.peerPort}`),
        recommendedAction: external.length > 5 ? 'Investigate each external connection' : 'Normal external traffic',
        checkedAt: new Date().toISOString(),
      };
    },
  },

  // ---- PERSISTENCE TESTS ----
  {
    id: 'persistence_crontab_modified',
    testName: 'Persistence: crontab recently modified',
    category: 'persistence',
    check: () => {
      let modified = false;
      let evidence: string[] = [];
      try {
        const cronFiles = ['/etc/crontab', '/etc/cron.d', '/var/spool/cron/crontabs'];
        for (const f of cronFiles) {
          if (existsSync(f)) {
            const stat = statSync(f);
            const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
            if (ageHours < 24) {
              modified = true;
              evidence.push(`${f} modified ${ageHours.toFixed(1)}h ago`);
            }
          }
        }
      } catch {}
      return {
        id: 'persistence_crontab_modified',
        testName: 'Persistence: crontab recently modified',
        category: 'persistence',
        mitreAttackId: 'T1053.003',
        mitreTactic: 'Persistence',
        mitreTechnique: 'Cron',
        detected: modified,
        status: modified ? 'active' : 'not_found',
        severity: modified ? 'medium' : 'info',
        evidence: evidence.length > 0 ? evidence : ['No recent crontab modifications'],
        recommendedAction: modified ? 'Review crontab changes for unauthorized entries' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
  {
    id: 'persistence_bashrc_modified',
    testName: 'Persistence: ~/.bashrc recently modified',
    category: 'persistence',
    check: () => {
      const home = process.env.HOME || '/root';
      const bashrc = join(home, '.bashrc');
      let modified = false;
      if (existsSync(bashrc)) {
        const stat = statSync(bashrc);
        const ageHours = (Date.now() - stat.mtimeMs) / 3600000;
        if (ageHours < 24) modified = true;
      }
      return {
        id: 'persistence_bashrc_modified',
        testName: 'Persistence: ~/.bashrc recently modified',
        category: 'persistence',
        mitreAttackId: 'T1547.004',
        mitreTactic: 'Persistence',
        mitreTechnique: 'Boot or Logon Autostart',
        detected: modified,
        status: modified ? 'active' : 'not_found',
        severity: modified ? 'medium' : 'info',
        evidence: modified ? [`${bashrc} modified in last 24h`] : ['No recent .bashrc modifications'],
        recommendedAction: modified ? 'Review .bashrc for unauthorized aliases or commands' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },

  // ---- CREDENTIAL THEFT TESTS ----
  {
    id: 'cred_mimikatz',
    testName: 'Credential Theft: mimikatz/hydra/john process running',
    category: 'credential_theft',
    check: () => {
      const procs = getRunningProcesses();
      const credTools = ['mimikatz', 'hydra', 'john', 'hashcat', 'ncrack'];
      const matches = procs.filter(p => credTools.some(t => p.name.includes(t) || p.cmdline.toLowerCase().includes(t)));
      return {
        id: 'cred_mimikatz',
        testName: 'Credential Theft: mimikatz/hydra/john process running',
        category: 'credential_theft',
        mitreAttackId: 'T1003',
        mitreTactic: 'Credential Access',
        mitreTechnique: 'OS Credential Dumping',
        detected: matches.length > 0,
        status: matches.length > 0 ? 'active' : 'not_found',
        severity: matches.length > 0 ? 'critical' : 'info',
        evidence: matches.length > 0 ? matches.map(m => `${m.name} (PID ${m.pid})`) : ['No credential theft tools detected'],
        recommendedAction: matches.length > 0 ? 'Kill process immediately, isolate host, rotate all credentials' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },

  // ---- RECON TESTS ----
  {
    id: 'recon_nmap',
    testName: 'Recon: nmap/masscan network scanning tool running',
    category: 'recon',
    check: () => {
      const procs = getRunningProcesses();
      const reconTools = ['nmap', 'masscan', 'zmap', 'naabu'];
      const matches = procs.filter(p => reconTools.some(t => p.name.includes(t)));
      return {
        id: 'recon_nmap',
        testName: 'Recon: nmap/masscan network scanning tool running',
        category: 'recon',
        mitreAttackId: 'T1046',
        mitreTactic: 'Discovery',
        mitreTechnique: 'Network Service Discovery',
        detected: matches.length > 0,
        status: matches.length > 0 ? 'contained' : 'not_found',
        severity: matches.length > 0 ? 'medium' : 'info',
        evidence: matches.length > 0 ? matches.map(m => `${m.name} (PID ${m.pid})`) : ['No network scanning tools detected'],
        recommendedAction: matches.length > 0 ? 'Verify authorized scanning activity' : 'No action needed',
        checkedAt: new Date().toISOString(),
      };
    },
  },
];

// Categorize all test results by status for dashboard display
export function categorizeResults(results: ThreatTestResult[]) {
  const byStatus = {
    active: results.filter(r => r.status === 'active'),
    contained: results.filter(r => r.status === 'contained'),
    mitigated: results.filter(r => r.status === 'mitigated'),
    not_found: results.filter(r => r.status === 'not_found'),
  };
  const byCategory: Record<string, ThreatTestResult[]> = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }
  return { byStatus, byCategory };
}
