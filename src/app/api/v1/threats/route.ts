import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const threats = await db.threat.findMany({ where: { status: { in: ['open', 'investigating'] } }, orderBy: { createdAt: 'desc' }, take: 100, include: { event: true } });
  return NextResponse.json({ threats, count: threats.length });
}