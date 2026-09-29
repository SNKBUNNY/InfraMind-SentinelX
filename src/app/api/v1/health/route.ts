import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeHealth, computeRisk } from '@/lib/engines/health';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const host = searchParams.get('host');
  if (host) {
    const [health, risk] = await Promise.all([
      db.healthScore.findFirst({ where: { host }, orderBy: { ts: 'desc' } }),
      db.riskScore.findFirst({ where: { host }, orderBy: { ts: 'desc' } }),
    ]);
    return NextResponse.json({ host, health, risk });
  }
  const hosts = await db.metric.findMany({ select: { host: true }, distinct: ['host'] });
  const results = [];
  for (const { host } of hosts) {
    const [health, risk] = await Promise.all([
      db.healthScore.findFirst({ where: { host }, orderBy: { ts: 'desc' } }),
      db.riskScore.findFirst({ where: { host }, orderBy: { ts: 'desc' } }),
    ]);
    results.push({ host, health, risk });
  }
  return NextResponse.json({ hosts: results });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.host) { await computeHealth(body.host); await computeRisk(body.host); return NextResponse.json({ ok: true }); }
  const hosts = await db.metric.findMany({ select: { host: true }, distinct: ['host'] });
  for (const { host } of hosts) { await computeHealth(host); await computeRisk(host); }
  return NextResponse.json({ ok: true, hosts: hosts.length });
}