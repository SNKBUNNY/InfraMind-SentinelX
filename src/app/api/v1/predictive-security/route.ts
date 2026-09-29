import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const suspiciousProcesses = await db.securityEvent.count({ where: { eventType: 'process', classification: { in: ['suspicious', 'malicious', 'ransomware'] }, timestamp: { gte: since } } });
  const encryptedFiles = await db.securityEvent.count({ where: { eventType: 'file', classification: 'ransomware', timestamp: { gte: since } } });
  const suspiciousNetwork = await db.securityEvent.count({ where: { eventType: 'network', classification: { in: ['suspicious', 'malicious'] }, timestamp: { gte: since } } });
  const criticalAnomalies = await db.anomaly.count({ where: { resolved: false, severity: 'critical' } });
  const totalBackups = await db.backup.count({ where: { createdAt: { gte: since } } });
  const failedBackups = await db.backup.count({ where: { status: 'failed', createdAt: { gte: since } } });
  const logit = (z: number) => 1 / (1 + Math.exp(-z));
  const predictions = [
    { predictionType: 'ransomware', probability: Math.round(logit(-3.5 + 0.3 * suspiciousProcesses + 0.5 * encryptedFiles + 0.2 * suspiciousNetwork) * 100) / 100, confidence: 0.8, horizon: '24h', rationale: `${suspiciousProcesses} suspicious processes, ${encryptedFiles} encrypted files, ${suspiciousNetwork} suspicious network events in last 24h` },
    { predictionType: 'infrastructure_failure', probability: Math.round(logit(-2 + 0.4 * criticalAnomalies) * 100) / 100, confidence: 0.75, horizon: '6h', rationale: `${criticalAnomalies} critical anomalies active` },
    { predictionType: 'backup_failure', probability: Math.round(logit(-3 + 5 * (totalBackups > 0 ? failedBackups / totalBackups : 0)) * 100) / 100, confidence: 0.7, horizon: '24h', rationale: `${failedBackups} of ${totalBackups} backups failed in last 24h` },
  ];
  return NextResponse.json({ predictions, count: predictions.length });
}