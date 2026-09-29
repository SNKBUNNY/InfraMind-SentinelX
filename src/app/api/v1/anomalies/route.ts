import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { scanForAnomalies } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const resolved = searchParams.get('resolved');
  const severity = searchParams.get('severity');
  const limit = Number(searchParams.get('limit') || 100);
  const where: any = {};
  if (resolved !== null && resolved !== undefined) where.resolved = resolved === 'true';
  if (severity) where.severity = severity;
  const anomalies = await db.anomaly.findMany({ where, orderBy: { ts: 'desc' }, take: limit });
  return NextResponse.json({ anomalies, count: anomalies.length });
}

export async function POST() {
  const result = await scanForAnomalies();
  return NextResponse.json(result);
}