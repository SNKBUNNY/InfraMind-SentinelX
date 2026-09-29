// POST /api/v1/agents-status/start — start a background agent task
// Body: { agentType, input, triggeredBy }
// Returns: { ok, taskId, status, message }

import { NextRequest, NextResponse } from 'next/server';
import { startBackgroundTask } from '@/lib/agents/background-runner';
import { ensureAgentsSeeded } from '@/lib/agents/engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureAgentsSeeded();
    const body = await req.json();
    const { agentType, input, triggeredBy } = body;

    if (!agentType) {
      return NextResponse.json({ error: 'agentType required' }, { status: 400 });
    }

    const result = await startBackgroundTask({
      agentType,
      input: input || {},
      triggeredBy: triggeredBy || 'dashboard',
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
