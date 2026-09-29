// POST /api/v1/sentinelx/compiler/evaluate — Compile + evaluate a policy against an event

import { NextRequest, NextResponse } from 'next/server';
import { compile, evaluateAst } from '@/lib/compiler/policy-compiler';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { policy_text, event_type, raw_data } = await req.json();
    if (!policy_text || !event_type) {
      return NextResponse.json({ error: 'Missing policy_text or event_type' }, { status: 400 });
    }

    const result = compile(policy_text);
    if (result.status !== 'success' || !result.ast) {
      return NextResponse.json({
        error: 'Compilation failed',
        details: result.errors,
      }, { status: 400 });
    }

    const matched = evaluateAst(result.ast.condition, event_type, raw_data || {});
    return NextResponse.json({
      policy_name: result.ast.name || 'Custom',
      matched,
      action: matched ? result.ast.action : null,
      event_type,
      raw_data_keys: Object.keys(raw_data || {}),
      bytecode: result.bytecode,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
