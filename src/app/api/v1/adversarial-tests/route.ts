// GET /api/v1/adversarial-tests — list test cases + recent results from DB
// POST /api/v1/adversarial-tests — run all tests OR a single test

import { NextRequest, NextResponse } from 'next/server';
import { TEST_CASES, runAllTests, runSingleTest, getRecentResults } from '@/lib/engines/adversarial-ai';

export const dynamic = 'force-dynamic';

export async function GET() {
  const recentResults = await getRecentResults(50);
  return NextResponse.json({
    tests: TEST_CASES.map((t) => ({
      id: t.id,
      testType: t.testType,
      input: t.input,
      target: t.target,
      expectedBehavior: t.expectedBehavior,
      severity: t.severity,
      mitigation: t.mitigation,
    })),
    count: TEST_CASES.length,
    recentResults: recentResults.map((r) => ({
      id: r.id,
      testType: r.testType,
      target: r.target,
      expectedBehavior: r.expectedBehavior,
      actualBehavior: r.actualBehavior,
      blocked: r.blocked,
      detected: r.detected,
      severity: r.severity,
      mitigationApplied: r.mitigationApplied,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // Run a single test
    if (body.testId) {
      const testCase = TEST_CASES.find((t) => t.id === body.testId);
      if (!testCase) {
        return NextResponse.json({ error: `Unknown testId: ${body.testId}` }, { status: 400 });
      }
      const result = await runSingleTest(testCase);
      return NextResponse.json({ ok: true, result });
    }

    // Run all tests
    const results = await runAllTests();
    return NextResponse.json({
      ok: true,
      total: results.total,
      passed: results.passed,
      failed: results.failed,
      passRate: results.total > 0 ? Math.round((results.passed / results.total) * 100) : 0,
      results,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
