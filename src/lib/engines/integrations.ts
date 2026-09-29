// SIEM/SOAR/ITSM Integration Engine — send events to external systems

import { db } from '@/lib/db';

// Default integrations (disabled — user configures endpoints)
export const DEFAULT_INTEGRATIONS = [
  { name: 'Splunk HEC', type: 'splunk', category: 'siem', description: 'Send security events to Splunk via HTTP Event Collector' },
  { name: 'Elasticsearch', type: 'elastic', category: 'siem', description: 'Send events to Elasticsearch for indexing' },
  { name: 'Syslog', type: 'syslog', category: 'siem', description: 'Forward events via syslog protocol' },
  { name: 'Slack Alerting', type: 'slack', category: 'notification', description: 'Send critical alerts to Slack channel' },
  { name: 'Email Notifications', type: 'email', category: 'notification', description: 'Send alerts via email' },
  { name: 'Microsoft Teams', type: 'teams', category: 'notification', description: 'Send alerts to Teams channel' },
  { name: 'Jira Tickets', type: 'jira', category: 'itsm', description: 'Create Jira tickets for incidents' },
  { name: 'Generic Webhook', type: 'webhook', category: 'soar', description: 'Send events to a generic webhook endpoint' },
];

// Ensure default integrations are seeded
export async function ensureIntegrationsSeeded(): Promise<void> {
  const existing = await db.integration.count();
  if (existing > 0) return;
  for (const integ of DEFAULT_INTEGRATIONS) {
    await db.integration.create({
      data: {
        name: integ.name,
        type: integ.type,
        category: integ.category,
        config: JSON.stringify({ description: integ.description, endpoint: '', enabled: false }),
        enabled: false,
      },
    });
  }
}

// Send an event to all enabled integrations
export async function sendToIntegrations(event: {
  eventType: string; // "security_event" | "incident" | "threat" | "alert"
  severity: string;
  title: string;
  description: string;
  data: Record<string, any>;
}): Promise<{ sent: number; failed: number; details: any[] }> {
  await ensureIntegrationsSeeded();

  const enabledIntegrations = await db.integration.findMany({ where: { enabled: true } });
  let sent = 0;
  let failed = 0;
  const details: any[] = [];

  for (const integration of enabledIntegrations) {
    const payload = formatPayload(integration.type, event);

    try {
      // In production: actual HTTP POST to integration endpoint
      // For demo: simulate successful send + record
      const result = await simulateSend(integration, payload);

      await db.outboundEvent.create({
        data: {
          integrationId: integration.id,
          integrationName: integration.name,
          eventType: event.eventType,
          payload: JSON.stringify(payload),
          status: 'sent',
          response: JSON.stringify(result),
          attempts: 1,
          sentAt: new Date(),
        },
      });

      await db.integration.update({
        where: { id: integration.id },
        data: { lastSentAt: new Date(), eventsSent: { increment: 1 } },
      });

      sent++;
      details.push({ integration: integration.name, status: 'sent', response: result });
    } catch (e: any) {
      await db.outboundEvent.create({
        data: {
          integrationId: integration.id,
          integrationName: integration.name,
          eventType: event.eventType,
          payload: JSON.stringify(payload),
          status: 'failed',
          response: e.message,
          attempts: 1,
        },
      });

      await db.integration.update({
        where: { id: integration.id },
        data: { eventsFailed: { increment: 1 } },
      });

      failed++;
      details.push({ integration: integration.name, status: 'failed', error: e.message });
    }
  }

  return { sent, failed, details };
}

// Format payload based on integration type
function formatPayload(type: string, event: any): any {
  switch (type) {
    case 'splunk':
      return {
        time: Math.floor(Date.now() / 1000),
        host: 'inframind-sentinelx',
        source: 'sentinelx',
        sourcetype: 'security_event',
        event: {
          eventType: event.eventType,
          severity: event.severity,
          title: event.title,
          description: event.description,
          data: event.data,
        },
      };
    case 'slack':
      return {
        text: `🚨 *${event.title}*`,
        attachments: [{
          color: event.severity === 'critical' ? 'danger' : event.severity === 'high' ? 'warning' : 'good',
          fields: [
            { title: 'Severity', value: event.severity, short: true },
            { title: 'Type', value: event.eventType, short: true },
            { title: 'Description', value: event.description, short: false },
          ],
          ts: Math.floor(Date.now() / 1000),
        }],
      };
    case 'email':
      return {
        subject: `[${event.severity.toUpperCase()}] ${event.title}`,
        body: `${event.description}\n\nEvent Data:\n${JSON.stringify(event.data, null, 2)}`,
        to: 'soc-team@organization.com',
      };
    case 'jira':
      return {
        fields: {
          project: { key: 'SEC' },
          summary: `[${event.severity}] ${event.title}`,
          description: event.description,
          issuetype: { name: event.severity === 'critical' ? 'Bug' : 'Task' },
          priority: { name: event.severity === 'critical' ? 'Highest' : 'Medium' },
        },
      };
    case 'webhook':
    default:
      return {
        timestamp: new Date().toISOString(),
        source: 'inframind-sentinelx',
        event,
      };
  }
}

// Actually send to the integration — replaces the previous simulateSend mock.
// Routes by integration type:
//   - email  → real SMTP via nodemailer
//   - jira   → real Jira REST API ticket creation
//   - slack  → real Slack incoming webhook
//   - webhook→ real generic HTTP POST
//   - splunk/elastic/syslog/teams → still simulated (configure your own HTTP client)
async function simulateSend(integration: any, payload: any): Promise<any> {
  const type = integration.type;
  const event = payload.event || payload;

  // EMAIL — real SMTP via nodemailer
  if (type === 'email') {
    const { sendEmail } = await import('./email-integration');
    const subject = `[${(event.severity || 'medium').toUpperCase()}] ${event.title || event.eventType || 'Alert'}`;
    const html = `
<div style="font-family: sans-serif; max-width: 640px; margin: 0 auto;">
  <h2 style="color: ${event.severity === 'critical' ? '#dc2626' : '#0f172a'};">${event.title || event.eventType}</h2>
  <p style="color: #475569;">${event.description || JSON.stringify(event.data || event, null, 2)}</p>
  <hr style="margin: 20px 0;">
  <p style="font-size: 12px; color: #64748b;">Sent via InfraMind-SentinelX Integration: ${integration.name}</p>
</div>`;
    const result = await sendEmail(subject, html);
    if (!result.ok) {
      throw new Error(`Email send failed: ${result.error}`);
    }
    return { statusCode: 200, message: `Email sent (ID: ${result.messageId})`, integration: integration.name };
  }

  // JIRA — real REST API
  if (type === 'jira') {
    const { createIncidentTicket } = await import('./jira-integration');
    const result = await createIncidentTicket({
      id: event.id || `EVT-${Date.now()}`,
      severity: event.severity || 'medium',
      type: event.title || event.eventType || 'Alert',
      description: event.description || JSON.stringify(event.data || {}, null, 2),
      host: event.host,
      createdAt: event.timestamp || new Date().toISOString(),
      recommendedAction: event.recommendedAction,
    });
    if (!result.ok) {
      throw new Error(`Jira ticket creation failed: ${result.error}`);
    }
    return {
      statusCode: 200,
      message: `Jira ticket created: ${result.issueKey} (${result.issueUrl})`,
      issueKey: result.issueKey,
      issueUrl: result.issueUrl,
      integration: integration.name,
    };
  }

  // SLACK — real incoming webhook
  if (type === 'slack') {
    let config: any = {};
    try { config = JSON.parse(integration.config || '{}'); } catch {}
    const webhookUrl = config.webhookUrl || process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('Slack webhook URL not configured — set webhookUrl in integration config or SLACK_WEBHOOK_URL env var');
    }
    const color = event.severity === 'critical' ? '#dc2626' : event.severity === 'high' ? '#ea580c' : '#3b82f6';
    const slackPayload = {
      attachments: [{
        fallback: `${event.title || event.eventType}: ${event.description || ''}`,
        color,
        title: event.title || event.eventType || 'Security Alert',
        text: event.description || '',
        fields: [
          { title: 'Severity', value: event.severity || 'medium', short: true },
          { title: 'Host', value: event.host || 'N/A', short: true },
        ],
        ts: Math.floor(Date.now() / 1000),
      }],
    };
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Slack API returned ${resp.status}: ${txt.substring(0, 200)}`);
    }
    return { statusCode: 200, message: 'Slack alert sent', integration: integration.name };
  }

  // GENERIC WEBHOOK — real HTTP POST
  if (type === 'webhook') {
    let config: any = {};
    try { config = JSON.parse(integration.config || '{}'); } catch {}
    const webhookUrl = config.webhookUrl || config.endpoint;
    if (!webhookUrl) {
      throw new Error('Webhook URL not configured — set webhookUrl in integration config');
    }
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Webhook returned ${resp.status}: ${txt.substring(0, 200)}`);
    }
    return { statusCode: 200, message: 'Webhook delivered', integration: integration.name };
  }

  // SPLUNK / ELASTIC / SYSLOG / TEAMS — still simulated (wire your own client)
  // Add real implementations here as needed.
  await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  return {
    statusCode: 200,
    message: `[SIMULATED] Event sent to ${integration.name} (${type}). Wire up the real HTTP client in src/lib/engines/integrations.ts`,
    integration: integration.name,
  };
}

// Get all integrations
export async function getIntegrations(): Promise<any[]> {
  await ensureIntegrationsSeeded();
  const integrations = await db.integration.findMany({ orderBy: { category: 'asc' } });
  return integrations.map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    category: i.category,
    config: JSON.parse(i.config || '{}'),
    enabled: i.enabled,
    lastSentAt: i.lastSentAt?.toISOString(),
    eventsSent: i.eventsSent,
    eventsFailed: i.eventsFailed,
  }));
}

// Update integration configuration
export async function updateIntegration(id: string, updates: { enabled?: boolean; config?: any }): Promise<any> {
  const data: any = {};
  if (updates.enabled !== undefined) data.enabled = updates.enabled;
  if (updates.config) data.config = JSON.stringify(updates.config);
  return db.integration.update({ where: { id }, data });
}

// Get outbound event history
export async function getOutboundEvents(limit: number = 50): Promise<any[]> {
  const events = await db.outboundEvent.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  return events.map((e) => ({
    id: e.id,
    integrationName: e.integrationName,
    eventType: e.eventType,
    payload: JSON.parse(e.payload || '{}'),
    status: e.status,
    response: e.response?.substring(0, 200),
    attempts: e.attempts,
    sentAt: e.sentAt?.toISOString(),
    createdAt: e.createdAt.toISOString(),
  }));
}