import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = await db.securityEvent.findMany({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] } }, orderBy: { timestamp: 'asc' }, take: 500 });
  const byHost: Record<string, any[]> = {};
  for (const e of events) { const k = e.host || e.agentId || 'unknown'; if (!byHost[k]) byHost[k] = []; byHost[k].push(e); }
  const paths: any[] = [];
  for (const [host, hostEvents] of Object.entries(byHost)) {
    if (hostEvents.length < 2) continue;
    paths.push({ id: `${host}-${Date.now()}`, host, severity: hostEvents.some(e => e.classification === 'ransomware') ? 'critical' : 'high', killChainProgress: 'impact', confidence: 0.85, evidenceCount: hostEvents.length, techniques: hostEvents.slice(0, 10).map(e => ({ tactic: e.eventType, technique: 'suspicious', ts: e.timestamp.toISOString() })), createdAt: new Date().toISOString() });
  }
  return NextResponse.json({ paths, count: paths.length });
}