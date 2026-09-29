// GET /api/v1/sentinelx/module/[type] — SentinelX events filtered by module/event_type

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type: eventType } = await params;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') || 100);

  const events = await db.securityEvent.findMany({
    where: { eventType },
    orderBy: { timestamp: 'desc' },
    take: Math.min(Math.max(limit, 1), 500),
  });

  return NextResponse.json({
    module: eventType,
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
    })),
  });
}
