import { NextResponse } from 'next/server';
import { getPlatformHealth } from '@/lib/engines/platform-observability';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await getPlatformHealth();
  return NextResponse.json(health);
}