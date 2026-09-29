// Real Email Notification Integration
// Sends actual SMTP emails for security alerts / incidents / anomalies.

import nodemailer from 'nodemailer';
import { db } from '@/lib/db';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  to: string[]; // recipient list
}

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedConfigHash: string | null = null;

async function getTransporter(): Promise<{ transporter: nodemailer.Transporter | null; config: EmailConfig | null; error?: string }> {
  // Try to load config from DB (Integration table)
  const integration = await db.integration.findUnique({ where: { type: 'email' } });
  if (!integration) {
    return { transporter: null, config: null, error: 'Email integration not found — run ensureIntegrationsSeeded first' };
  }

  let config: EmailConfig;
  try {
    const stored = JSON.parse(integration.config || '{}');
    config = {
      host: stored.host || process.env.SMTP_HOST || '',
      port: stored.port || Number(process.env.SMTP_PORT) || 587,
      secure: stored.secure ?? (process.env.SMTP_SECURE === 'true'),
      user: stored.user || process.env.SMTP_USER || '',
      pass: stored.pass || process.env.SMTP_PASS || '',
      from: stored.from || process.env.SMTP_FROM || 'inframind-sentinelx@localhost',
      to: stored.to || (process.env.SMTP_TO ? process.env.SMTP_TO.split(',') : []),
    };
  } catch {
    return { transporter: null, config: null, error: 'Invalid email config JSON' };
  }

  if (!config.host || !config.user || !config.pass) {
    return { transporter: null, config, error: 'Email not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS env vars OR configure via /api/v1/integrations' };
  }

  // Cache transporter — recreate if config changed
  const configHash = `${config.host}:${config.port}:${config.user}`;
  if (cachedTransporter && cachedConfigHash === configHash) {
    return { transporter: cachedTransporter, config };
  }

  try {
    cachedTransporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    cachedConfigHash = configHash;
    return { transporter: cachedTransporter, config };
  } catch (e: any) {
    return { transporter: null, config, error: `Failed to create transporter: ${e.message}` };
  }
}

export async function sendEmail(subject: string, htmlBody: string, textBody?: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const { transporter, config, error } = await getTransporter();
  if (!transporter || !config) {
    return { ok: false, error: error || 'Email transporter unavailable' };
  }
  if (config.to.length === 0) {
    return { ok: false, error: 'No recipients configured' };
  }

  try {
    const info = await transporter.sendMail({
      from: config.from,
      to: config.to.join(', '),
      subject,
      text: textBody || htmlBody.replace(/<[^>]+>/g, ''),
      html: htmlBody,
    });
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Format + send an incident alert email
export async function sendIncidentEmail(incident: {
  id: string;
  severity: string;
  type: string;
  description: string;
  host?: string;
  createdAt: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const color = incident.severity === 'critical' ? '#dc2626' : incident.severity === 'high' ? '#ea580c' : incident.severity === 'medium' ? '#ca8a04' : '#16a34a';
  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto;">
  <div style="background: #0f172a; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">${incident.severity.toUpperCase()} Incident Alert</h1>
    <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">InfraMind-SentinelX Autonomous SecOps</p>
  </div>
  <div style="background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
    <div style="background: ${color}; color: white; padding: 8px 14px; border-radius: 4px; display: inline-block; font-weight: 600; font-size: 13px; margin-bottom: 16px;">${incident.severity.toUpperCase()}</div>
    <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #0f172a;">${incident.type}</h2>
    <p style="margin: 0 0 16px 0; color: #334155; line-height: 1.5;">${incident.description}</p>
    <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #64748b; width: 100px;">Incident ID:</td><td style="padding: 6px 0; font-family: monospace; color: #0f172a;">${incident.id}</td></tr>
      <tr><td style="padding: 6px 0; color: #64748b;">Host:</td><td style="padding: 6px 0; color: #0f172a;">${incident.host || 'N/A'}</td></tr>
      <tr><td style="padding: 6px 0; color: #64748b;">Detected:</td><td style="padding: 6px 0; color: #0f172a;">${new Date(incident.createdAt).toLocaleString()}</td></tr>
    </table>
    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      This alert was generated automatically by InfraMind-SentinelX. Visit the dashboard to investigate.
    </div>
  </div>
</div>`;
  return sendEmail(`[${incident.severity.toUpperCase()}] ${incident.type}`, html);
}

// Format + send an anomaly email
export async function sendAnomalyEmail(anomaly: {
  id: string;
  host: string;
  metric: string;
  value: number;
  expected: number;
  algorithm: string;
  severity: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const html = `
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #f59e0b;">Anomaly Detected — ${anomaly.algorithm}</h2>
  <p><strong>Host:</strong> ${anomaly.host}</p>
  <p><strong>Metric:</strong> ${anomaly.metric}</p>
  <p><strong>Observed value:</strong> ${anomaly.value}</p>
  <p><strong>Expected range:</strong> ${anomaly.expected}</p>
  <p><strong>Severity:</strong> ${anomaly.severity}</p>
  <hr style="margin-top: 20px;">
  <p style="font-size: 12px; color: #666;">InfraMind-SentinelX Anomaly Detection Engine</p>
</div>`;
  return sendEmail(`[ANOMALY] ${anomaly.host} ${anomaly.metric} = ${anomaly.value} (expected ${anomaly.expected})`, html);
}
