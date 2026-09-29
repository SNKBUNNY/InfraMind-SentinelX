// GET /api/v1/integrations — list all integrations
// POST /api/v1/integrations — multi-action:
//   { action: 'send', event }                         → send event to all enabled integrations
//   { action: 'update', id, enabled?, config? }      → toggle or reconfigure integration
//   { action: 'configure_email', config }            → configure SMTP settings for email
//   { action: 'configure_jira', config }             → configure Jira credentials
//   { action: 'configure_slack', config }             → configure Slack webhook
//   { action: 'configure_webhook', id, config }      → configure generic webhook
//   { action: 'test', id }                           → send a test alert to one integration
//   { action: 'send_incident', incident }             → format + send incident to all enabled

import { NextRequest, NextResponse } from 'next/server';
import { getIntegrations, updateIntegration, sendToIntegrations } from '@/lib/engines/integrations';
import { sendIncidentEmail } from '@/lib/engines/email-integration';
import { createIncidentTicket, testJiraConnection } from '@/lib/engines/jira-integration';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const integrations = await getIntegrations();
  return NextResponse.json({ integrations });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Send an event to all enabled integrations
    if (body.action === 'send') {
      const result = await sendToIntegrations(body.event);
      return NextResponse.json(result);
    }

    // Generic update (toggle / set config)
    if (body.action === 'update') {
      const result = await updateIntegration(body.id, { enabled: body.enabled, config: body.config });
      return NextResponse.json({ integration: result });
    }

    // Configure Email (SMTP)
    if (body.action === 'configure_email') {
      const config = body.config; // { host, port, secure, user, pass, from, to: [] }
      const integration = await db.integration.findUnique({ where: { type: 'email' } });
      if (!integration) return NextResponse.json({ error: 'Email integration not found' }, { status: 404 });
      const updated = await db.integration.update({
        where: { id: integration.id },
        data: {
          enabled: true,
          config: JSON.stringify(config),
        },
      });
      return NextResponse.json({
        ok: true,
        message: 'Email integration configured. Test with action: "test".',
        integration: { id: updated.id, name: updated.name, type: updated.type, enabled: updated.enabled },
      });
    }

    // Configure Jira
    if (body.action === 'configure_jira') {
      const config = body.config; // { baseUrl, email, apiToken, projectKey, issueType }
      const integration = await db.integration.findUnique({ where: { type: 'jira' } });
      if (!integration) return NextResponse.json({ error: 'Jira integration not found' }, { status: 404 });
      const updated = await db.integration.update({
        where: { id: integration.id },
        data: {
          enabled: true,
          config: JSON.stringify(config),
        },
      });
      return NextResponse.json({
        ok: true,
        message: 'Jira integration configured. Test with action: "test".',
        integration: { id: updated.id, name: updated.name, type: updated.type, enabled: updated.enabled },
      });
    }

    // Configure Slack webhook
    if (body.action === 'configure_slack') {
      const config = body.config; // { webhookUrl }
      const integration = await db.integration.findUnique({ where: { type: 'slack' } });
      if (!integration) return NextResponse.json({ error: 'Slack integration not found' }, { status: 404 });
      const updated = await db.integration.update({
        where: { id: integration.id },
        data: {
          enabled: true,
          config: JSON.stringify(config),
        },
      });
      return NextResponse.json({
        ok: true,
        message: 'Slack integration configured. Test with action: "test".',
        integration: { id: updated.id, name: updated.name, type: updated.type, enabled: updated.enabled },
      });
    }

    // Test a specific integration
    if (body.action === 'test') {
      const integration = await db.integration.findUnique({ where: { id: body.id } });
      if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 });

      // For Jira, test connection
      if (integration.type === 'jira') {
        const result = await testJiraConnection();
        return NextResponse.json(result);
      }

      // For others, send a test event
      const testEvent = {
        eventType: 'test',
        severity: 'low',
        title: `Test alert from ${integration.name}`,
        description: `This is a test alert sent at ${new Date().toISOString()} to verify the integration is working.`,
        data: { timestamp: new Date().toISOString() },
      };
      const result = await sendToIntegrations(testEvent);
      return NextResponse.json(result);
    }

    // Send a formatted incident alert to all enabled integrations
    if (body.action === 'send_incident') {
      const incident = body.incident;
      // Send via the standard integrations pipeline
      const result = await sendToIntegrations({
        eventType: 'incident',
        severity: incident.severity,
        title: incident.type || 'Incident',
        description: incident.description,
        data: incident,
        host: incident.host,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
