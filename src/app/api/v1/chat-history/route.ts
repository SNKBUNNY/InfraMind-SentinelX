import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const messages = await db.chatMessage.findMany({ orderBy: { createdAt: 'asc' }, take: 100 });
  return NextResponse.json({ messages });
}