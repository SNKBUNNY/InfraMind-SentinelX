import { NextResponse } from 'next/server';
import { getVulnerabilities } from '@/lib/engines/asset-vulnerability';

export const dynamic = 'force-dynamic';

export async function GET() {
  const vulns = await getVulnerabilities();
  return NextResponse.json({ vulnerabilities: vulns, count: vulns.length });
}