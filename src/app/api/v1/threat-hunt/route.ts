// GET /api/v1/threat-hunt — list hypotheses + last hunt result
// POST /api/v1/threat-hunt — run a real hunt (or run specific hypothesis)

import { NextRequest, NextResponse } from 'next/server';
import { runFullHunt, getHypotheses, runHypothesis, searchIOC } from '@/lib/engines/threat-hunt';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  // GET ?action=ioc&type=ip&value=1.2.3.4 — search for an IOC
  if (action === 'ioc') {
    const iocType = (url.searchParams.get('type') as 'ip' | 'process' | 'file' | 'port') || 'ip';
    const value = url.searchParams.get('value') || '';
    if (!value) return NextResponse.json({ error: 'Missing value param' }, { status: 400 });
    const results = await searchIOC(iocType, value);
    return NextResponse.json({ iocType, value, count: results.length, evidence: results });
  }

  // Default: list hypotheses + last hunt result (does NOT re-run)
  const hypotheses = await getHypotheses();
  return NextResponse.json({
    hypotheses: hypotheses.map((h) => ({
      ...h,
      lastRun: h.lastRun?.toISOString() || null,
    })),
    lastHunt: null, // user must POST to run a hunt
    hint: 'POST /api/v1/threat-hunt with {} to run a full hunt, or { "hypothesisId": "ransomware_recon" } to run one hypothesis',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Run a specific hypothesis
    if (body.hypothesisId) {
      const hypotheses = await getHypotheses();
      const target = hypotheses.find((h) => h.id === body.hypothesisId);
      if (!target) {
        return NextResponse.json({ error: `Unknown hypothesisId: ${body.hypothesisId}` }, { status: 400 });
      }
      const result = await runHypothesis(target);
      return NextResponse.json({
        ok: true,
        hypothesis: {
          ...result,
          lastRun: result.lastRun?.toISOString() || null,
        },
      });
    }

    // Run a full hunt across all hypotheses
    const result = await runFullHunt();
    return NextResponse.json({
      ok: true,
      lastHunt: result.lastHunt,
      hypotheses: result.hypotheses.map((h) => ({
        ...h,
        lastRun: h.lastRun?.toISOString() || null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
