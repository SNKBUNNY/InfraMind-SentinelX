// GET /api/v1/sentinelx/incidents — SentinelX incidents (threat_score >= 50)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || 100);
  const minScore = Number(url.searchParams.get('min_score') || 50);

  const events = await db.securityEvent.findMany({
    where: { threatScore: { gte: minScore } },
    orderBy: { timestamp: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

  return NextResponse.json({
    count: events.length,
    incidents: events.map((e) => ({
      id: e.id,
      agent_id: e.agentId,
      event_type: e.eventType,
      timestamp: e.timestamp.toISOString(),
      raw_data: JSON.parse(e.rawData || '{}'),
      threat_score: e.threatScore,
      classification: e.classification,
      policy_match: e.policyMatch,
      policy_action: e.policyAction,
    })),
  });
}
