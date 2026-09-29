// GET /api/v1/agents-status/task?taskId=<id> — get task status + steps (for polling)
// GET /api/v1/agents-status/task?running=true — list currently running tasks

import { NextRequest, NextResponse } from 'next/server';
import { getTaskStatus, getRunningTasks } from '@/lib/agents/background-runner';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');
  const running = url.searchParams.get('running');

  if (running === 'true') {
    const tasks = getRunningTasks();
    return NextResponse.json({ running: tasks, count: tasks.length });
  }

  if (!taskId) {
    return NextResponse.json({ error: 'taskId or running=true required' }, { status: 400 });
  }

  const status = await getTaskStatus(taskId);
  if (!status) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(status);
}
