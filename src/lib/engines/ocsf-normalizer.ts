// OCSF Event Normalization — maps all telemetry sources to a unified event model
// Sources: linux_agent, windows_agent, docker, k8s, network_sensor, log

import { db } from '@/lib/db';
import { randomUUID } from 'crypto';

export interface OCSFEvent {
  eventId: string;
  timestamp: Date;
  category: string;   // system | network | file | process | registry | usb | authentication | discovery
  activity: string;   // process_create | file_modify | network_connect | etc.
  severity: string;   // info | low | medium | high | critical
  deviceName?: string;
  deviceIp?: string;
  deviceOs?: string;
  processName?: string;
  processPid?: number;
  processCmdline?: string;
  userName?: string;
  dstIp?: string;
  dstPort?: number;
  srcIp?: string;
  srcPort?: number;
  protocol?: string;
  filePath?: string;
  fileHash?: string;
  fileAction?: string;
  rawData: Record<string, any>;
  metadata: Record<string, any>;
  sourceType: string;  // linux_agent | windows_agent | docker | k8s | network_sensor | log
  sourceId?: string;
}

// Normalize a raw event from any source into the OCSF format
export function normalizeEvent(rawEvent: {
  eventType: string;
  host: string;
  agentId: string;
  timestamp: string;
  rawData: Record<string, any>;
}, sourceType: string = 'linux_agent'): OCSFEvent {
  const d = rawEvent.rawData;
  let category = 'system';
  let activity = rawEvent.eventType;
  let severity: string = 'info';
  const normalized: OCSFEvent = {
    eventId: randomUUID(),
    timestamp: new Date(rawEvent.timestamp),
    category,
    activity,
    severity,
    deviceName: rawEvent.host,
    deviceOs: sourceType.includes('windows') ? 'windows' : sourceType.includes('linux') ? 'linux' : 'unknown',
    rawData: d,
    metadata: { sourceAgent: rawEvent.agentId },
    sourceType,
    sourceId: rawEvent.agentId,
  };

  // Map event types to OCSF categories
  if (rawEvent.eventType === 'process') {
    normalized.category = 'process';
    normalized.activity = d.isSuspicious ? 'suspicious_process_detected' : 'process_observed';
    normalized.processName = d.name;
    normalized.processPid = d.pid;
    normalized.processCmdline = d.cmdline;
    normalized.userName = d.user;
    if (d.isSuspicious) normalized.severity = 'high';
    if (d.cpuPercent > 90) normalized.severity = 'medium';
  } else if (rawEvent.eventType === 'network') {
    normalized.category = 'network';
    normalized.activity = 'network_connect';
    normalized.dstIp = d.dst_ip || d.dstIp;
    normalized.dstPort = d.port || d.dstPort;
    normalized.processName = d.process;
    normalized.processPid = d.pid;
    normalized.protocol = d.protocol || 'tcp';
    if (d.isSuspicious) normalized.severity = 'high';
    else if (normalized.dstIp && !isInternalIp(normalized.dstIp)) normalized.severity = 'low';
  } else if (rawEvent.eventType === 'file') {
    normalized.category = 'file';
    normalized.activity = `file_${d.action || 'modify'}`;
    normalized.filePath = d.file_path || d.filePath;
    normalized.fileAction = d.action;
    normalized.processName = d.process_name;
    if (d.extension && ['.encrypted', '.locked', '.locky', '.crypto'].includes(d.extension.toLowerCase())) {
      normalized.severity = 'critical';
      normalized.activity = 'ransomware_encryption_detected';
    }
  } else if (rawEvent.eventType === 'registry') {
    normalized.category = 'registry';
    normalized.activity = `registry_${d.action || 'modify'}`;
    if (d.key && d.key.toLowerCase().includes('run')) normalized.severity = 'high';
  } else if (rawEvent.eventType === 'usb') {
    normalized.category = 'usb';
    normalized.activity = `usb_${d.action || 'inserted'}`;
    normalized.severity = 'low';
  } else if (rawEvent.eventType === 'authentication') {
    normalized.category = 'authentication';
    normalized.activity = d.action || 'login_success';
    normalized.userName = d.user;
    normalized.srcIp = d.sourceIp || d.srcIp;
    if (d.action === 'login_failed') normalized.severity = 'medium';
    if (d.sourceIp && !isInternalIp(d.sourceIp)) normalized.severity = 'high';
  } else if (rawEvent.eventType === 'system') {
    normalized.category = 'system';
    normalized.activity = 'resource_usage';
    normalized.severity = 'info';
  }

  return normalized;
}

function isInternalIp(ip: string): boolean {
  if (!ip) return true;
  return ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.') || ip === '127.0.0.1' || ip === '::1';
}

// Persist a normalized OCSF event to the database
export async function persistOCSFEvent(event: OCSFEvent): Promise<string> {
  const created = await db.unifiedSecurityEvent.create({
    data: {
      eventId: event.eventId,
      timestamp: event.timestamp,
      category: event.category,
      activity: event.activity,
      severity: event.severity,
      deviceName: event.deviceName,
      deviceIp: event.deviceIp,
      deviceOs: event.deviceOs,
      processName: event.processName,
      processPid: event.processPid,
      processCmdline: event.processCmdline,
      userName: event.userName,
      dstIp: event.dstIp,
      dstPort: event.dstPort,
      srcIp: event.srcIp,
      srcPort: event.srcPort,
      protocol: event.protocol,
      filePath: event.filePath,
      fileHash: event.fileHash,
      fileAction: event.fileAction,
      rawData: JSON.stringify(event.rawData),
      metadata: JSON.stringify(event.metadata),
      sourceType: event.sourceType,
      sourceId: event.sourceId,
    },
  });
  return created.id;
}

// Get OCSF events with filtering
export async function getOCSFEvents(options: {
  limit?: number;
  category?: string;
  severity?: string;
  sourceType?: string;
  deviceName?: string;
  since?: Date;
} = {}): Promise<any[]> {
  const where: any = {};
  if (options.category) where.category = options.category;
  if (options.severity) where.severity = options.severity;
  if (options.sourceType) where.sourceType = options.sourceType;
  if (options.deviceName) where.deviceName = options.deviceName;
  if (options.since) where.timestamp = { gte: options.since };

  const events = await db.unifiedSecurityEvent.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: options.limit || 100,
  });

  return events.map((e) => ({
    id: e.id,
    eventId: e.eventId,
    timestamp: e.timestamp.toISOString(),
    category: e.category,
    activity: e.activity,
    severity: e.severity,
    deviceName: e.deviceName,
    deviceOs: e.deviceOs,
    processName: e.processName,
    processPid: e.processPid,
    userName: e.userName,
    dstIp: e.dstIp,
    dstPort: e.dstPort,
    filePath: e.filePath,
    sourceType: e.sourceType,
    threatScore: e.threatScore,
    classification: e.classification,
    mitreAttackId: e.mitreAttackId,
    isProcessed: e.isProcessed,
  }));
}

// Get OCSF event statistics
export async function getOCSFStats(): Promise<any> {
  const total = await db.unifiedSecurityEvent.count();
  const byCategory = await db.unifiedSecurityEvent.groupBy({ by: ['category'], _count: true });
  const bySeverity = await db.unifiedSecurityEvent.groupBy({ by: ['severity'], _count: true });
  const bySource = await db.unifiedSecurityEvent.groupBy({ by: ['sourceType'], _count: true });
  const unprocessed = await db.unifiedSecurityEvent.count({ where: { isProcessed: false } });
  return {
    total,
    unprocessed,
    byCategory: byCategory.map((c) => ({ category: c.category, count: c._count })),
    bySeverity: bySeverity.map((s) => ({ severity: s.severity, count: s._count })),
    bySource: bySource.map((s) => ({ source: s.sourceType, count: s._count })),
  };
}