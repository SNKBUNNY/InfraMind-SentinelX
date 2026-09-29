import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const host = searchParams.get('host');
  const metric = searchParams.get('metric');
  const range = searchParams.get('range') || '1h';
  const limit = Number(searchParams.get('limit') || 500);
  const m = range.match(/^(\d+)([smhd])$/);
  let ms = 60 * 60 * 1000;
  if (m) { const n = Number(m[1]); switch (m[2]) { case 's': ms = n * 1000; break; case 'm': ms = n * 60 * 1000; break; case 'h': ms = n * 60 * 60 * 1000; break; case 'd': ms = n * 24 * 60 * 60 * 1000; break; } }
  const since = new Date(Date.now() - ms);
  const where: any = { ts: { gte: since } };
  if (host) where.host = host;
  if (metric) where.metric = metric;
  const points = await db.metric.findMany({ where, orderBy: { ts: 'asc' }, take: limit });
  return NextResponse.json({ points, host, metric, range });
}