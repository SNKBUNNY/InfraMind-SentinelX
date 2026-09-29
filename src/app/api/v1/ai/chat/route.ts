import { NextRequest, NextResponse } from 'next/server';
import { chat } from '@/lib/ai/llm-client';
import { retrieve } from '@/lib/rag/engine';
import { recordAuditEvent } from '@/lib/engines/audit-trail';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history, useRAG = true } = body;
    if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });
    let ragDocs: any[] = [];
    if (useRAG) {
      try {
        const results = await retrieve(message, 3, undefined, true);
        ragDocs = results.map((r) => ({ title: r.title, source: r.source, content: r.content, score: r.score }));
      } catch {}
    }
    const { reply, context } = await chat(message, history, ragDocs.length > 0 ? ragDocs : undefined);
    await recordAuditEvent({ actor: 'user:chatops', action: 'AI_CHAT', target: 'llm:z-ai-sdk', reason: message.substring(0, 100), result: 'SUCCESS', metadata: { replyLength: reply.length, ragDocsCount: ragDocs.length } });
    return NextResponse.json({
      reply,
      context: { metricsCount: context.metricsCount, incidentsCount: context.incidentsCount, anomaliesCount: context.anomaliesCount, threatsCount: context.threatsCount, eventsCount: context.eventsCount, sources: context.sources },
      retrievedDocs: ragDocs,
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}