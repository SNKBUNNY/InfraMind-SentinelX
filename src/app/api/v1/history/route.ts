import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const host = searchParams.get('host') || '';
  const metric = searchParams.get('metric') || 'cpu';
  const range = searchParams.get('range') || '24h';
  const m = range.match(/^(\d+)([smhd])$/);
  let ms = 24 * 60 * 60 * 1000;
  if (m) { const n = Number(m[1]); switch (m[2]) { case 's': ms = n * 1000; break; case 'm': ms = n * 60 * 1000; break; case 'h': ms = n * 60 * 60 * 1000; break; case 'd': ms = n * 24 * 60 * 60 * 1000; break; } }
  const since = new Date(Date.now() - ms);
  const where: any = { metric, ts: { gte: since } };
  if (host) where.host = host;
  const points = await db.metric.findMany({ where, orderBy: { ts: 'asc' }, take: 5000 });
  if (points.length === 0) return NextResponse.json({ host, metric, range, stats: null, points: [] });
  const values = points.map(p => p.value);
  const sorted = [...values].sort((a, b) => a - b);
  const stats = { count: values.length, min: sorted[0], max: sorted[sorted.length - 1], avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100, p50: sorted[Math.floor(sorted.length * 0.5)], p95: sorted[Math.floor(sorted.length * 0.95)], p99: sorted[Math.floor(sorted.length * 0.99)] };
  return NextResponse.json({ host, metric, range, stats, points: points.map(p => ({ ts: p.ts.toISOString(), value: p.value })) });
}