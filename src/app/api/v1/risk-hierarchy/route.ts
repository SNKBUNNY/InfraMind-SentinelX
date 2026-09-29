import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const activeThreats = await db.threat.count({ where: { status: { in: ['open', 'investigating'] } } });
  const criticalThreats = await db.threat.count({ where: { status: { in: ['open', 'investigating'] }, severity: 'critical' } });
  const suspiciousEvents = await db.securityEvent.count({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] }, timestamp: { gte: since } } });
  const activeAnomalies = await db.anomaly.count({ where: { resolved: false } });
  const openIncidents = await db.incident.count({ where: { status: { in: ['open', 'acknowledged'] } } });
  const totalBackups = await db.backup.count();
  const completedBackups = await db.backup.count({ where: { status: 'completed' } });
  const secScore = Math.min(100, activeThreats * 5 + criticalThreats * 15 + suspiciousEvents * 2);
  const infraScore = Math.min(100, activeAnomalies * 3 + openIncidents * 5);
  const recScore = Math.min(100, totalBackups > 0 ? (1 - completedBackups / totalBackups) * 50 : 50);
  const orgScore = Math.round(secScore * 0.5 + infraScore * 0.3 + recScore * 0.2);
  const level = (s: number) => s >= 80 ? 'critical' : s >= 60 ? 'high' : s >= 30 ? 'medium' : 'low';
  return NextResponse.json({
    organization: { scope: 'organization', score: orgScore, level: level(orgScore), trend: 'stable', factors: { security: secScore, infrastructure: infraScore, recovery: recScore } },
    security: { scope: 'security', score: Math.round(secScore), level: level(secScore), factors: { activeThreats, criticalThreats, suspiciousEvents } },
    infrastructure: { scope: 'infrastructure', score: Math.round(infraScore), level: level(infraScore), factors: { activeAnomalies, openIncidents } },
    recovery: { scope: 'recovery', score: Math.round(recScore), level: level(recScore), factors: { totalBackups, completedBackups } },
  });
}