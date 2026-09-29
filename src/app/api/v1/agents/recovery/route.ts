import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureAgentsSeeded, executeAgentTask } from '@/lib/agents/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await ensureAgentsSeeded();
  const body = await req.json();
  const { input } = body;
  const agent = await db.agent.findUnique({ where: { name: 'Recovery Agent' } });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  const result = await executeAgentTask(agent.id, input || {});
  return NextResponse.json({ ok: true, agentId: agent.id, result });
}