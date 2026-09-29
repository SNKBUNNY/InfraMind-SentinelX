import { NextRequest, NextResponse } from 'next/server';
import { ensureAgentsSeeded, executeAgentTask, AGENT_CONFIGS } from '@/lib/agents/engine';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureAgentsSeeded();
  const agents = await db.agent.findMany({ orderBy: { type: 'asc' } });
  return NextResponse.json({
    agents: agents.map((a) => ({
      id: a.id, name: a.name, type: a.type, description: a.description, status: a.status,
      capabilities: JSON.parse(a.capabilities || '[]'), lastRunAt: a.lastRunAt?.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    await ensureAgentsSeeded();
    const body = await req.json();
    const { agentType, input } = body;
    if (!agentType) return NextResponse.json({ error: 'agentType required' }, { status: 400 });
    const cfg = AGENT_CONFIGS.find((c) => c.type === agentType);
    if (!cfg) return NextResponse.json({ error: 'Unknown agent type' }, { status: 400 });
    const agent = await db.agent.findUnique({ where: { name: cfg.name } });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    const result = await executeAgentTask(agent.id, input || {});
    return NextResponse.json({ ok: true, agentId: agent.id, result });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}