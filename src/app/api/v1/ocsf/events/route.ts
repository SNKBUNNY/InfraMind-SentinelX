import { NextRequest, NextResponse } from 'next/server';
import { getOCSFEvents, getOCSFStats } from '@/lib/engines/ocsf-normalizer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('stats') === 'true') {
    const stats = await getOCSFStats();
    return NextResponse.json(stats);
  }
  const events = await getOCSFEvents({
    limit: Number(searchParams.get('limit') || 100),
    category: searchParams.get('category') || undefined,
    severity: searchParams.get('severity') || undefined,
    sourceType: searchParams.get('sourceType') || undefined,
  });
  return NextResponse.json({ events, count: events.length });
}