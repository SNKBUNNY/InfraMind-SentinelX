import { NextRequest, NextResponse } from 'next/server';
import { executeTool } from '@/lib/engines/ai-gateway';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await executeTool({
      toolName: body.toolName,
      agentName: body.agentName,
      userId: body.userId,
      parameters: body.parameters || {},
      threatScore: body.threatScore,
    });
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}