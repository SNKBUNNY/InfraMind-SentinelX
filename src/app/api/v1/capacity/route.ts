import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const forecasts = await db.forecast.findMany({ where: { ts: { gte: new Date() } }, orderBy: { ts: 'asc' }, take: 500 });
  const grouped: Record<string, any> = {};
  for (const f of forecasts) { const k = `${f.host}/${f.metric}`; if (!grouped[k]) grouped[k] = { host: f.host, metric: f.metric, points: [] }; grouped[k].points.push({ ts: f.ts.toISOString(), value: f.value }); }
  const items = Object.values(grouped).map((g: any) => { const values = g.points.map((p: any) => p.value); const current = values[0] || 0; const peak = Math.max(...values); const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length; return { host: g.host, metric: g.metric, current: Math.round(current * 100) / 100, peak: Math.round(peak * 100) / 100, avg: Math.round(avg * 100) / 100, recommendation: peak > 85 ? `${g.host}/${g.metric}: projected to reach ${peak.toFixed(1)}% — consider scaling` : 'within normal range' }; });
  return NextResponse.json({ horizon: '7d', items });
}