// GET /api/v1/sentinelx/events — SentinelX recent events (real-time)
// POST /api/v1/sentinelx/events — Receive a synthetic event from agent

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyzeEvent } from '@/lib/security/threat-engine';
import { evaluateEvent } from '@/lib/compiler/policy-compiler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || 100);
  const eventType = url.searchParams.get('event_type') || undefined;

  const where: any = {};
  if (eventType) where.eventType = eventType;

  const events = await db.securityEvent.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

  return NextResponse.json({
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      agent_id: e.agentId,
      event_type: e.eventType,
      timestamp: e.timestamp.toISOString(),
      raw_data: JSON.parse(e.rawData || '{}'),
      threat_score: e.threatScore,
      classification: e.classification,
      policy_match: e.policyMatch,
      policy_action: e.policyAction,
      is_processed: e.isProcessed,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_id, event_type, timestamp, raw_data } = body;
    if (!agent_id || !event_type) {
      return NextResponse.json({ error: 'Missing agent_id or event_type' }, { status: 400 });
    }

    // Run threat engine + policy compiler
    const analysis = analyzeEvent(event_type, raw_data || {});
    const policyAction = evaluateEvent(event_type, raw_data || {});
    let threatScore = analysis.threatScore;
    let classification = analysis.classification;
    if (policyAction) {
      threatScore = Math.max(threatScore, 85);
      if (classification === 'benign') classification = 'suspicious';
    }

    const event = await db.securityEvent.create({
      data: {
        agentId: agent_id,
        eventType: event_type,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        rawData: JSON.stringify(raw_data || {}),
        host: raw_data?.host || 'unknown',
        agentName: raw_data?.host || agent_id,
        isProcessed: true,
        threatScore,
        classification,
        policyMatch: !!policyAction,
        policyAction: policyAction || undefined,
      },
    });

    return NextResponse.json({
      id: event.id,
      agent_id: event.agentId,
      event_type: event.eventType,
      timestamp: event.timestamp.toISOString(),
      raw_data: JSON.parse(event.rawData || '{}'),
      threat_score: event.threatScore,
      classification: event.classification,
      policy_match: event.policyMatch,
      policy_action: event.policyAction,
      is_processed: event.isProcessed,
      analysis: {
        mitre_attack_id: analysis.mitreAttackId,
        mitre_tactic: analysis.mitreTactic,
        mitre_technique: analysis.mitreTechnique,
        indicators: analysis.indicators,
        description: analysis.description,
        recommended_action: analysis.recommendedAction,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
