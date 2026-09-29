import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || 100);
  const logs = await db.logEntry.findMany({ orderBy: { ts: 'desc' }, take: limit });
  return NextResponse.json({ logs, count: logs.length });
}