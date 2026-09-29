import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyzeEvent } from '@/lib/security/threat-engine';
import { evaluateEvent } from '@/lib/compiler/policy-compiler';
import { normalizeEvent, persistOCSFEvent } from '@/lib/engines/ocsf-normalizer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || 100);
  const classification = searchParams.get('classification');
  const eventType = searchParams.get('eventType');
  const where: any = {};
  if (classification) where.classification = classification;
  if (eventType) where.eventType = eventType;
  const events = await db.securityEvent.findMany({ where, orderBy: { timestamp: 'desc' }, take: limit });
  return NextResponse.json({ events, count: events.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, eventType, rawData, agentName, host } = body;
    if (!agentId || !eventType || !rawData) return NextResponse.json({ error: 'agentId, eventType, rawData required' }, { status: 400 });

    // Normalize to OCSF + persist
    const normalized = normalizeEvent({ eventType, host: host || agentId, agentId, timestamp: new Date().toISOString(), rawData }, agentId.includes('linux') ? 'linux_agent' : 'windows_agent');
    await persistOCSFEvent(normalized);

    const event = await db.securityEvent.create({ data: { agentId, eventType, timestamp: new Date(), rawData: JSON.stringify(rawData), agentName: agentName || agentId, host: host || agentId, unifiedEventId: normalized.eventId } });
    const analysis = analyzeEvent(eventType, rawData);
    const policyAction = evaluateEvent(eventType, rawData);
    let threatScore = analysis.threatScore;
    let classification = analysis.classification;
    let policyMatch = false;
    if (policyAction) { policyMatch = true; threatScore = Math.max(threatScore, 85); if (classification === 'benign') classification = 'suspicious'; }
    const updated = await db.securityEvent.update({ where: { id: event.id }, data: { isProcessed: true, threatScore, classification, policyMatch, policyAction: policyAction || undefined } });
    await db.unifiedSecurityEvent.update({ where: { eventId: normalized.eventId }, data: { isProcessed: true, threatScore, classification, mitreAttackId: analysis.mitreAttackId } });
    let threat = null;
    if (threatScore >= 40 && analysis.mitreAttackId) {
      threat = await db.threat.create({ data: { eventId: event.id, threatType: analysis.threatType || 'suspicious', mitreAttackId: analysis.mitreAttackId, mitreTactic: analysis.mitreTactic, mitreTechnique: analysis.mitreTechnique, severity: threatScore >= 80 ? 'critical' : threatScore >= 50 ? 'high' : 'medium', confidence: Math.min(1, threatScore / 100), indicators: JSON.stringify(analysis.indicators), description: analysis.description, recommendedAction: analysis.recommendedAction, status: 'open' } });
    }
    return NextResponse.json({ event: updated, threat, analysis });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}