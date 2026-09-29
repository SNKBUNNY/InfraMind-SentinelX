import { NextResponse } from 'next/server';
import { getAssetInventory } from '@/lib/engines/asset-vulnerability';

export const dynamic = 'force-dynamic';

export async function GET() {
  const inventory = await getAssetInventory();
  return NextResponse.json(inventory);
}