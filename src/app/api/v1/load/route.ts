// POST /api/v1/load — InfraMind load generator controls.
// Body: { type: "cpu"|"memory"|"disk"|"network", host, intensity, durationMin }
//       or { action: "list" }

import { NextRequest, NextResponse } from 'next/server';
import {
  startLoad,
  listActiveLoads,
  LOAD_DESCRIPTIONS,
  EXPECTED_IMPACT,
} from '@/lib/engines/load-generator';

export const dynamic = 'force-dynamic';

export async function GET() {
  const loads = listActiveLoads();
  return NextResponse.json({
    active: loads,
    count: loads.length,
    note: 'Active load injections on this host. Each entry has a startedAt + expectedDurationMs.',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === 'list') {
    const loads = listActiveLoads();
    return NextResponse.json({ loads: { localhost: loads } });
  }

  const { type, host, intensity, durationMin } = body;
  if (!type || !host) {
    return NextResponse.json({ error: 'Missing type or host' }, { status: 400 });
  }
  if (!['cpu', 'memory', 'disk', 'network'].includes(type)) {
    return NextResponse.json(
      { error: `Invalid type "${type}". Must be one of: cpu, memory, disk, network` },
      { status: 400 },
    );
  }

  // Clamp intensity to [0.5, 1.0] and durationMin to [2, 10]
  const finalIntensity = Math.max(0.5, Math.min(1, Number(intensity ?? 0.8)));
  const finalDuration = Math.max(2, Math.min(10, Number(durationMin ?? 3)));

  const load = startLoad({
    type: type as 'cpu' | 'memory' | 'disk' | 'network',
    host,
    intensity: finalIntensity,
    durationMin: finalDuration,
  });

  return NextResponse.json({
    ok: true,
    message: `Load ${type} started on ${host} for ${finalDuration}min at ${(finalIntensity * 100).toFixed(0)}% intensity`,
    description: LOAD_DESCRIPTIONS[type as 'cpu' | 'memory' | 'disk' | 'network'](
      finalIntensity,
      finalDuration,
    ),
    intensity: finalIntensity,
    durationMin: finalDuration,
    expectedImpact: EXPECTED_IMPACT[type as 'cpu' | 'memory' | 'disk' | 'network'],
    startedAt: new Date(load.startedAt).toISOString(),
    expectedEndAt: new Date(load.startedAt + load.expectedDurationMs).toISOString(),
    hint: 'Auto-run a cycle (POST /api/v1/cron) after ~8 seconds to see the resulting incident/anomaly.',
  });
}
