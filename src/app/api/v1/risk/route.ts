import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
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