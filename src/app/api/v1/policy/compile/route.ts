import { NextRequest, NextResponse } from 'next/server';
import { compile, evaluateAst, DEFAULT_POLICIES } from '@/lib/compiler/policy-compiler';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const policies = await db.policy.findMany({ orderBy: { createdAt: 'desc' } });
  if (policies.length === 0) {
    for (const src of DEFAULT_POLICIES) {
      const r = compile(src);
      if (r.status === 'success' && r.ast) {
        await db.policy.create({ data: { name: r.ast.name, source: src, ast: JSON.stringify(r.ast), bytecode: JSON.stringify(r.bytecode), action: r.ast.action, enabled: true, category: 'ransomware', description: `Default: ${r.ast.name}` } });
      }
    }
  }
  const all = await db.policy.findMany({ orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ policies: all });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { source } = body;
  if (!source) return NextResponse.json({ error: 'source required' }, { status: 400 });
  const result = compile(source);
  return NextResponse.json(result);
}