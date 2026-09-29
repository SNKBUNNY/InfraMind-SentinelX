// POST /api/v1/sentinelx/simulate — Run a threat simulation (inject a real
// observable threat event on this host so the threat-engine + policy-compiler
// pipeline can be exercised end-to-end).
//
// Body: { type: "ransomware_recon" | "encoded_powershell" | ... }
// GET   : list available simulation types.

import { NextRequest, NextResponse } from 'next/server';
import { runSimulation, SIM_TYPES } from '@/lib/engines/sentinelx-simulator';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    available_simulations: SIM_TYPES,
    note:
      'POST with { "type": "ransomware_recon" } to inject a real observable threat event. Each simulation persists a SecurityEvent and returns the threat-engine analysis + policy-compiler verdict.',
  });
}

export async function POST(req: NextRequest) {
  try {
    const { type } = await req.json();
    if (!type) {
      return NextResponse.json({ error: 'Missing type. GET /api/v1/sentinelx/simulate for available types.' }, { status: 400 });
    }
    const result = runSimulation(type);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
