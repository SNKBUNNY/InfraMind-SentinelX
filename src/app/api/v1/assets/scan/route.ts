import { NextResponse } from 'next/server';
import { scanHostForVulnerabilities } from '@/lib/engines/asset-vulnerability';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await scanHostForVulnerabilities();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}