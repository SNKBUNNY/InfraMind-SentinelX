import { NextResponse } from 'next/server';
import { ensureRBACSeeded, getUsers, getOrganizations } from '@/lib/engines/rbac';

export const dynamic = 'force-dynamic';

export async function GET() {
  await ensureRBACSeeded();
  const [users, orgs] = await Promise.all([getUsers(), getOrganizations()]);
  return NextResponse.json({ users, organizations: orgs });
}