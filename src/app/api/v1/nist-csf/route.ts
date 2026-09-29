import { NextResponse } from 'next/server';
import { computeNistCsfPosture, getNistCsfPosture } from '@/lib/engines/nist-csf';

export const dynamic = 'force-dynamic';

export async function GET() {
  const posture = await getNistCsfPosture();
  return NextResponse.json(posture);
}

export async function POST() {
  const posture = await computeNistCsfPosture();
  return NextResponse.json({ ok: true, posture });
}