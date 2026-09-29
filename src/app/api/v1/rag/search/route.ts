import { NextRequest, NextResponse } from 'next/server';
import { retrieve, seedKnowledgeBase } from '@/lib/rag/engine';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('query') || '';
  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });
  const docCount = await db.knowledgeDocument.count();
  if (docCount === 0) await seedKnowledgeBase();
  const results = await retrieve(query, Number(searchParams.get('topK') || 5), undefined, true);
  return NextResponse.json({ query, results, totalFound: results.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const docCount = await db.knowledgeDocument.count();
  if (docCount === 0) await seedKnowledgeBase();
  const results = await retrieve(body.query, body.topK || 5, body.sources, body.rerank !== false);
  return NextResponse.json({ query: body.query, results, totalFound: results.length });
}