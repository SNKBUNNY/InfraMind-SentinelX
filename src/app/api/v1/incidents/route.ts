import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateThresholdIncidents, generateIncidentsFromAnomalies } from '@/lib/orchestrator';
import { recordAuditEvent } from '@/lib/engines/audit-trail';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const severity = searchParams.get('severity');
  const limit = Number(searchParams.get('limit') || 100);
  const where: any = {};
  if (status) where.status = status;
  if (severity) where.severity = severity;
  const incidents = await db.incident.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: { rootCause: true } });
  return NextResponse.json({ incidents, count: incidents.length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    if (action === 'generate') {
      const t = await generateThresholdIncidents();
      const a = await generateIncidentsFromAnomalies();
      return NextResponse.json({ generated: t + a });
    }
    if (action === 'create_from_event') {
      const { eventId, severity, affected, reason, recommendation } = body;
      const incident = await db.incident.create({ data: { severity: severity || 'major', status: 'open', type: 'security', affected, reason, recommendation: recommendation || null, relatedEventIds: JSON.stringify([eventId]) } });
      await recordAuditEvent({ actor: 'user:soc-analyst', action: 'CREATE_INCIDENT', target: `incident:${incident.id}`, reason, result: 'SUCCESS', metadata: { eventId } });
      return NextResponse.json({ ok: true, incident });
    }
    if (action === 'acknowledge') {
      const { id, author } = body;
      const inc = await db.incident.findUnique({ where: { id } });
      if (!inc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const notes = JSON.parse(inc.workNotes || '[]');
      notes.push({ ts: new Date().toISOString(), author: author || 'system', note: 'Acknowledged' });
      const updated = await db.incident.update({ where: { id }, data: { status: 'acknowledged', workNotes: JSON.stringify(notes) } });
      await recordAuditEvent({ actor: `user:${author || 'analyst'}`, action: 'ACKNOWLEDGE_INCIDENT', target: `incident:${id}`, result: 'SUCCESS' });
      return NextResponse.json({ incident: updated });
    }
    if (action === 'addNote') {
      const { id, author, note } = body;
      const inc = await db.incident.findUnique({ where: { id } });
      if (!inc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      const notes = JSON.parse(inc.workNotes || '[]');
      notes.push({ ts: new Date().toISOString(), author: author || 'system', note });
      const updated = await db.incident.update({ where: { id }, data: { workNotes: JSON.stringify(notes) } });
      return NextResponse.json({ incident: updated });
    }
    if (action === 'resolve') {
      const { id, resolution } = body;
      const updated = await db.incident.update({ where: { id }, data: { status: 'resolved', resolution, resolvedAt: new Date() } });
      await recordAuditEvent({ actor: 'user:soc-analyst', action: 'RESOLVE_INCIDENT', target: `incident:${id}`, reason: resolution, result: 'SUCCESS' });
      return NextResponse.json({ incident: updated });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}