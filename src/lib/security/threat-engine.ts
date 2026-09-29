// Threat Engine — rule-based scoring with MITRE ATT&CK mapping
export const SUSPICIOUS_PROCESS_NAMES = ['vssadmin.exe', 'cipher.exe', 'wbadmin.exe', 'bcdedit.exe', 'powershell.exe', 'cmd.exe', 'wmic.exe', 'net.exe', 'netsh.exe', 'regsvr32.exe', 'mshta.exe', 'rundll32.exe', 'schtasks.exe', 'mimikatz.exe', 'nmap', 'nc', 'ncat', 'hydra', 'john', 'hashcat'];
export const SUSPICIOUS_EXTENSIONS = ['.encrypted', '.locked', '.crypto', '.locky', '.crypt', '.enc', '.ransom'];

export interface ThreatAnalysis {
  threatScore: number;
  classification: 'benign' | 'suspicious' | 'malicious' | 'ransomware';
  indicators: string[];
  mitreAttackId?: string;
  mitreTactic?: string;
  mitreTechnique?: string;
  threatType?: string;
  description: string;
  recommendedAction: string;
}

export function analyzeEvent(eventType: string, rawData: Record<string, any>): ThreatAnalysis {
  let score = 0;
  const indicators: string[] = [];

  if (eventType === 'process') {
    const name = String(rawData.name || '').toLowerCase();
    if (SUSPICIOUS_PROCESS_NAMES.includes(name)) { score += 40; indicators.push(`suspicious_process:${name}`); }
    const cmdline = String(rawData.cmdline || '').toLowerCase();
    if (cmdline.includes('delete shadows') || cmdline.includes('vssadmin delete')) { score += 50; indicators.push('ransomware_behavior:vssadmin_delete'); }
    if (name === 'powershell.exe' && (cmdline.includes('encodedcommand') || cmdline.includes('-enc'))) { score += 35; indicators.push('encoded_powershell'); }
    if (['nmap', 'masscan'].includes(name)) { score += 25; indicators.push('network_scan'); }
    if (['mimikatz', 'hydra', 'john', 'hashcat'].includes(name)) { score += 60; indicators.push('credential_theft_tool'); }
  }
  if (eventType === 'file') {
    const filePath = String(rawData.file_path || rawData.filePath || '');
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    if (SUSPICIOUS_EXTENSIONS.includes(ext)) { score += 60; indicators.push(`suspicious_extension:${ext}`); }
    if (rawData.action === 'modified' && rawData.process_name) {
      const procName = String(rawData.process_name).toLowerCase();
      if (SUSPICIOUS_PROCESS_NAMES.includes(procName)) { score += 30; indicators.push(`file_modified_by_suspicious:${procName}`); }
    }
  }
  if (eventType === 'registry') {
    const key = String(rawData.key || '').toLowerCase();
    if (key.includes('run') || key.includes('currentversion\\run')) { score += 35; indicators.push('registry_persistence'); }
  }
  if (eventType === 'network') {
    const dstIp = String(rawData.dst_ip || rawData.dstIp || '');
    const port = Number(rawData.port || rawData.dstPort || 0);
    if ([4444, 4445, 6667].includes(port)) { score += 40; indicators.push(`c2_port:${port}`); }
    if ([9001, 9030, 9050, 9051, 9150].includes(port)) { score += 35; indicators.push(`tor_port:${port}`); }
    if (dstIp && !dstIp.startsWith('10.') && !dstIp.startsWith('192.168.') && !dstIp.startsWith('172.')) {
      if (port === 53 || port === 8080 || port === 8443) { score += 20; indicators.push('external_connection'); }
    }
  }

  score = Math.min(100, score);
  let classification: ThreatAnalysis['classification'] = 'benign';
  if (score >= 80) classification = 'ransomware';
  else if (score >= 40) classification = 'suspicious';

  let mitreAttackId: string | undefined;
  let mitreTactic: string | undefined;
  let mitreTechnique: string | undefined;
  let threatType: string | undefined;
  let description = '';
  let recommendedAction = '';

  if (indicators.some((i) => i.startsWith('ransomware_behavior'))) {
    mitreAttackId = 'T1490'; mitreTactic = 'Impact'; mitreTechnique = 'Inhibit System Recovery';
    threatType = 'ransomware';
    description = 'Ransomware behavior detected — attempting to delete system recovery mechanisms.';
    recommendedAction = 'Isolate host immediately, trigger backup, block process via policy, initiate ransomware_response workflow.';
  } else if (indicators.some((i) => i.startsWith('suspicious_extension'))) {
    mitreAttackId = 'T1486'; mitreTactic = 'Impact'; mitreTechnique = 'Data Encrypted for Impact';
    threatType = 'ransomware';
    description = 'Files with known ransomware extensions detected.';
    recommendedAction = 'Quarantine affected files, isolate endpoint, trigger recovery workflow.';
  } else if (indicators.includes('encoded_powershell')) {
    mitreAttackId = 'T1059.001'; mitreTactic = 'Execution'; mitreTechnique = 'PowerShell';
    threatType = 'execution';
    description = 'Encoded PowerShell command detected — often used for fileless malware delivery.';
    recommendedAction = 'Block process, investigate script content, scan for persistence.';
  } else if (indicators.includes('registry_persistence')) {
    mitreAttackId = 'T1547.001'; mitreTactic = 'Persistence'; mitreTechnique = 'Registry Run Keys';
    threatType = 'persistence';
    description = 'Persistence mechanism via registry Run key detected.';
    recommendedAction = 'Investigate the registered program, remove the key, scan the host.';
  } else if (indicators.some((i) => i.startsWith('c2_port'))) {
    mitreAttackId = 'T1071'; mitreTactic = 'Command and Control'; mitreTechnique = 'Application Layer Protocol';
    threatType = 'c2_communication';
    description = 'Connection to suspicious C2 port detected.';
    recommendedAction = 'Block IP at firewall, isolate host, hunt for lateral movement.';
  } else if (indicators.includes('credential_theft_tool')) {
    mitreAttackId = 'T1003'; mitreTactic = 'Credential Access'; mitreTechnique = 'OS Credential Dumping';
    threatType = 'credential_theft';
    description = 'Credential theft tool detected.';
    recommendedAction = 'Isolate host, reset all credentials, audit recent logins.';
  } else if (indicators.includes('network_scan')) {
    mitreAttackId = 'T1046'; mitreTactic = 'Discovery'; mitreTechnique = 'Network Service Discovery';
    threatType = 'discovery';
    description = 'Network scanning tool detected.';
    recommendedAction = 'Investigate the scan source, check for follow-up exploitation attempts.';
  } else if (score > 0) {
    mitreAttackId = 'T1204'; mitreTactic = 'Execution'; mitreTechnique = 'User Execution';
    threatType = 'suspicious';
    description = 'Suspicious activity detected by rule-based engine.';
    recommendedAction = 'Investigate the event, correlate with other events from the same host.';
  } else {
    description = 'No threat indicators detected — event classified as benign.';
    recommendedAction = 'No action required.';
  }

  return { threatScore: score, classification, indicators, mitreAttackId, mitreTactic, mitreTechnique, threatType, description, recommendedAction };
}