import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { forecast, autoSelectModel, parseHorizon } from '@/lib/engines/forecast';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const host = searchParams.get('host');
  const metric = searchParams.get('metric');
  const horizonStr = searchParams.get('horizon') || '6h';
  if (!host || !metric) {
    const since = new Date();
    const all = await db.forecast.findMany({ where: { ts: { gte: since } }, orderBy: { ts: 'asc' }, take: 1000 });
    const grouped: Record<string, any> = {};
    for (const f of all) { const k = `${f.host}/${f.metric}`; if (!grouped[k]) grouped[k] = { host: f.host, metric: f.metric, model: f.model, points: [] }; grouped[k].points.push({ ts: f.ts.toISOString(), value: f.value, lower: f.lower, upper: f.upper }); }
    return NextResponse.json({ forecasts: Object.values(grouped) });
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const history = await db.metric.findMany({ where: { host, metric, ts: { gte: since } }, orderBy: { ts: 'asc' }, take: 288 });
  const points = history.map((m) => ({ ts: m.ts.toISOString(), value: m.value }));
  const { points: horizon, stepMs } = parseHorizon(horizonStr);
  const model = autoSelectModel(metric);
  const forecastPoints = forecast(points, horizon, stepMs, model);
  return NextResponse.json({ host, metric, model, horizon: horizonStr, history: points.slice(-100), forecast: forecastPoints });
}