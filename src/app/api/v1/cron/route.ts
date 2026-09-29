import { NextResponse } from 'next/server';
import { runCycle, startAutoCycle, stopAutoCycle, getCycleStatus } from '@/lib/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET() { return NextResponse.json(getCycleStatus()); }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'auto-start') { startAutoCycle(Number(body.intervalMs) || 60000); return NextResponse.json({ ok: true, ...getCycleStatus() }); }
    if (body.action === 'auto-stop') { stopAutoCycle(); return NextResponse.json({ ok: true, ...getCycleStatus() }); }
    const result = await runCycle();
    return NextResponse.json({ ok: true, result, ...getCycleStatus() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}