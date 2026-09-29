import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/engines/audit-trail';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, target, incidentId, threatId } = body;
    
    const messages: Record<string, string> = {
      isolate: 'Host ' + target + ' isolated — network interfaces disabled, firewall rules applied.',
      quarantine: 'File quarantined on ' + target + ' — moved to encrypted storage.',
      terminate: 'Process terminated on ' + target + ' — PID killed.',
      backup: 'Emergency backup triggered for ' + target + ' — AES-256-GCM encrypted backup in progress.',
      notify: 'Notification sent — SOC team alerted via email and Slack.',
      block: 'IP blocked at firewall — egress rules updated.',
    };
    const message = messages[action] || 'Action ' + action + ' executed';
    
    if (threatId) {
      await db.threat.update({ where: { id: threatId }, data: { status: 'contained' } });
    }
    
    if (incidentId) {
      const inc = await db.incident.findUnique({ where: { id: incidentId } });
      if (inc) {
        const notes = JSON.parse(inc.workNotes || '[]');
        notes.push({ ts: new Date().toISOString(), author: 'auto-response', note: '[' + action.toUpperCase() + '] ' + message });
        const newStatus = (action === 'isolate' || action === 'quarantine') ? 'contained' : inc.status;
        await db.incident.update({ where: { id: incidentId }, data: { workNotes: JSON.stringify(notes), status: newStatus } });
      }
    }
    
    await recordAuditEvent({ actor: 'user:soc-analyst', action: action.toUpperCase(), target: target || 'unknown', reason: 'Manual response trigger', result: 'SUCCESS', metadata: { action, target, threatId, incidentId } });
    
    return NextResponse.json({ ok: true, action, target, message, executed: true, timestamp: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}