import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const limit = Number(searchParams.get('limit') || 20);
  const where: any = {};
  if (type) where.type = type;
  const reports = await db.report.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, title } = body;
  if (!type || !title) return NextResponse.json({ error: 'type, title required' }, { status: 400 });
  let content: any = {}; let summary = '';
  if (type === 'security') {
    const threats = await db.threat.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { event: true } });
    const events = await db.securityEvent.findMany({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] } }, orderBy: { timestamp: 'desc' }, take: 50 });
    const threatsData = threats.map((t) => {
      let indicators: any[] = [];
      try { indicators = JSON.parse(t.indicators || '[]'); } catch {}
      return { threatType: t.threatType, severity: t.severity, mitreAttackId: t.mitreAttackId, confidence: t.confidence, description: t.description, indicators };
    });
    const eventsData = events.map((e) => ({ eventType: e.eventType, classification: e.classification, threatScore: e.threatScore, host: e.host }));
    content = { threats: threatsData, events: eventsData };
    summary = `Security report: ${threats.length} threats, ${events.length} suspicious events.`;
  } else if (type === 'incident') {
    const incidents = await db.incident.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { rootCause: true } });
    content = { incidents };
    summary = `Incident report: ${incidents.length} incidents.`;
  } else if (type === 'infrastructure') {
    const health = await db.healthScore.findMany({ orderBy: { ts: 'desc' }, take: 100 });
    const anomalies = await db.anomaly.findMany({ where: { resolved: false }, orderBy: { ts: 'desc' }, take: 50 });
    content = { healthScores: health, anomalies };
    summary = `Infrastructure report: ${health.length} health scores, ${anomalies.length} anomalies.`;
  } else if (type === 'executive') {
    const totalIncidents = await db.incident.count();
    const openIncidents = await db.incident.count({ where: { status: { in: ['open', 'acknowledged'] } } });
    const activeThreats = await db.threat.count({ where: { status: { in: ['open', 'investigating'] } } });
    content = { summary: { totalIncidents, openIncidents, activeThreats } };
    summary = `Executive summary: ${openIncidents} open incidents, ${activeThreats} active threats.`;
  }
  const report = await db.report.create({ data: { type, title, format: 'json', content: JSON.stringify(content), summary, generatedBy: 'system' } });
  return NextResponse.json({ report });
}
// Force recompile