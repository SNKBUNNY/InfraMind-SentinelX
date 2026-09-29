import { NextRequest, NextResponse } from 'next/server';
import { getAuditEvents, verifyAuditChain } from '@/lib/engines/audit-trail';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  if (action === 'verify') {
    const result = await verifyAuditChain();
    return NextResponse.json(result);
  }
  const events = await getAuditEvents({
    limit: Number(searchParams.get('limit') || 100),
    actor: searchParams.get('actor') || undefined,
    action: searchParams.get('action_filter') || undefined,
    target: searchParams.get('target') || undefined,
    result: searchParams.get('result') || undefined,
  });
  return NextResponse.json({ events, count: events.length });
}