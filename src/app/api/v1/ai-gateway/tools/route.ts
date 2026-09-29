import { NextRequest, NextResponse } from 'next/server';
import { getTools, getPendingApprovals, approveToolExecution } from '@/lib/engines/ai-gateway';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('view') === 'approvals') {
    const approvals = await getPendingApprovals();
    return NextResponse.json({ approvals, count: approvals.length });
  }
  const tools = await getTools();
  return NextResponse.json({ tools });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === 'approve') {
      const result = await approveToolExecution(body.executionId, body.approved, body.approver || 'soc-analyst');
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}