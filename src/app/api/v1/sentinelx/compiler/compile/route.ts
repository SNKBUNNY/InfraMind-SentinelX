// POST /api/v1/sentinelx/compiler/compile — Compile a .psec DSL policy

import { NextRequest, NextResponse } from 'next/server';
import { compile, DEFAULT_POLICIES } from '@/lib/compiler/policy-compiler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { policy_text } = await req.json();
    if (!policy_text) {
      return NextResponse.json({ error: 'Missing policy_text' }, { status: 400 });
    }
    const result = compile(policy_text);
    return NextResponse.json({
      ...result,
      default_policies: DEFAULT_POLICIES,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
