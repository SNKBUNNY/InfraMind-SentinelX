import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const sources = await db.knowledgeDocument.groupBy({ by: ['source'], _count: true });
  return NextResponse.json({ sources });
}