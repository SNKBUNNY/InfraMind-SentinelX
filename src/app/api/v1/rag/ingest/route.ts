import { NextRequest, NextResponse } from 'next/server';
import { seedKnowledgeBase, ingestDocument, buildVectorIndex } from '@/lib/rag/engine';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const docs = await db.knowledgeDocument.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ documents: docs.map(d => ({ id: d.id, source: d.source, title: d.title, chunkCount: d.chunkCount, embedded: d.embedded, createdAt: d.createdAt.toISOString() })), count: docs.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.action === 'seed') { const r = await seedKnowledgeBase(); await buildVectorIndex(); return NextResponse.json({ ok: true, ingested: r.ingested }); }
  const { source, title, content } = body;
  if (!source || !title || !content) return NextResponse.json({ error: 'source, title, content required' }, { status: 400 });
  const r = await ingestDocument(source, title, content);
  await buildVectorIndex();
  return NextResponse.json({ ok: true, ...r });
}