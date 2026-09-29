import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCycleStatus } from '@/lib/orchestrator';
import { getPlatformInfo } from '@/lib/collectors/system';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [
      metricsCount, openIncidents, activeAnomalies, criticalThreats, securityEvents,
      pendingRecs, backups, hosts, recentIncidents, activeAnomalyList, criticalThreatList,
      recentEvents, recommendations, healthScores, riskScores, recentLogs,
    ] = await Promise.all([
      db.metric.count(),
      db.incident.count({ where: { status: { in: ['open', 'acknowledged'] } } }),
      db.anomaly.count({ where: { resolved: false } }),
      db.threat.count({ where: { status: { in: ['open', 'investigating'] } } }),
      db.securityEvent.count({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] } } }),
      db.recommendation.count({ where: { applied: false } }),
      db.backup.count(),
      db.metric.findMany({ select: { host: true }, distinct: ['host'] }),
      db.incident.findMany({ where: { status: { in: ['open', 'acknowledged'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      db.anomaly.findMany({ where: { resolved: false }, orderBy: { ts: 'desc' }, take: 10 }),
      db.threat.findMany({ where: { status: { in: ['open', 'investigating'] } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      db.securityEvent.findMany({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] } }, orderBy: { timestamp: 'desc' }, take: 10 }),
      db.recommendation.findMany({ where: { applied: false }, orderBy: { createdAt: 'desc' }, take: 10 }),
      db.healthScore.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
      db.riskScore.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
      db.logEntry.findMany({ orderBy: { ts: 'desc' }, take: 10 }),
    ]);

    return NextResponse.json({
      stats: { hosts: hosts.length, metrics: metricsCount, openIncidents, activeAnomalies, criticalThreats, securityEvents, pendingRecommendations: pendingRecs, backups },
      cycleStatus: getCycleStatus(),
      platform: getPlatformInfo(),
      hosts: hosts.map((h) => h.host),
      recentIncidents, activeAnomalies: activeAnomalyList, criticalThreats: criticalThreatList,
      recentEvents, recommendations, healthScores, riskScores, recentLogs,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}