// POST /api/v1/anomalies/remediate
//   Body: { anomalyId }                       → generate LLM-based remediation plan
//   Body: { anomalyId, executeStep: <num> }   → execute a specific step via AI Gateway

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateRemediationPlan, executeRemediationStep } from '@/lib/engines/remediation-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { anomalyId, executeStep } = body;

    if (!anomalyId) {
      return NextResponse.json({ error: 'anomalyId required' }, { status: 400 });
    }

    // Fetch the anomaly from DB
    const anomaly = await db.anomaly.findUnique({ where: { id: anomalyId } });
    if (!anomaly) {
      return NextResponse.json({ error: 'Anomaly not found' }, { status: 404 });
    }

    // If executeStep is provided, execute that step
    if (executeStep !== undefined) {
      // First generate the plan to get the step
      const plan = await generateRemediationPlan({
        id: anomaly.id,
        host: anomaly.host,
        metric: anomaly.metric,
        value: anomaly.value,
        expected: anomaly.expected || 0,
        algorithm: anomaly.algorithm,
        severity: anomaly.severity,
      });

      const step = plan.steps.find(s => s.step === Number(executeStep));
      if (!step) {
        return NextResponse.json({ error: `Step ${executeStep} not found in plan` }, { status: 404 });
      }

      const result = await executeRemediationStep(anomaly.id, step);
      return NextResponse.json({
        ok: result.ok,
        step,
        result: result.result,
        error: result.error,
      });
    }

    // Otherwise, just generate the plan
    const plan = await generateRemediationPlan({
      id: anomaly.id,
      host: anomaly.host,
      metric: anomaly.metric,
      value: anomaly.value,
      expected: anomaly.expected || 0,
      algorithm: anomaly.algorithm,
      severity: anomaly.severity,
    });

    return NextResponse.json({
      ok: true,
      plan,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
