// Real Jira Integration — creates actual Jira tickets for incidents.
// Uses the Jira REST API v2 (https://developer.atlassian.com/cloud/jira/platform/rest/v2/)

import { db } from '@/lib/db';

export interface JiraConfig {
  baseUrl: string;   // e.g. https://your-domain.atlassian.net
  email: string;     // API token owner email
  apiToken: string;  // API token from https://id.atlassian.com/manage-profile/security/api-tokens
  projectKey: string; // e.g. SEC
  issueType: string;  // e.g. Incident, Task, Story (must exist in the project)
}

async function getConfig(): Promise<{ config: JiraConfig | null; error?: string }> {
  const integration = await db.integration.findUnique({ where: { type: 'jira' } });
  if (!integration) {
    return { config: null, error: 'Jira integration not found — run ensureIntegrationsSeeded first' };
  }

  let stored: any = {};
  try { stored = JSON.parse(integration.config || '{}'); } catch {}

  const config: JiraConfig = {
    baseUrl: stored.baseUrl || process.env.JIRA_BASE_URL || '',
    email: stored.email || process.env.JIRA_EMAIL || '',
    apiToken: stored.apiToken || process.env.JIRA_API_TOKEN || '',
    projectKey: stored.projectKey || process.env.JIRA_PROJECT_KEY || 'SEC',
    issueType: stored.issueType || process.env.JIRA_ISSUE_TYPE || 'Incident',
  };

  if (!config.baseUrl || !config.email || !config.apiToken) {
    return { config, error: 'Jira not configured — set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN env vars OR configure via /api/v1/integrations' };
  }

  return { config };
}

// Jira uses Basic Auth with email:api_token
function authHeader(config: JiraConfig): string {
  return 'Basic ' + Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
}

export async function createIncidentTicket(incident: {
  id: string;
  severity: string;
  type: string;
  description: string;
  host?: string;
  createdAt: string;
  recommendedAction?: string;
}): Promise<{ ok: boolean; issueKey?: string; issueUrl?: string; error?: string }> {
  const { config, error } = await getConfig();
  if (!config) return { ok: false, error };

  const priority = incident.severity === 'critical' ? 'Highest' : incident.severity === 'high' ? 'High' : incident.severity === 'medium' ? 'Medium' : 'Low';

  const body = {
    fields: {
      project: { key: config.projectKey },
      summary: `[${incident.severity.toUpperCase()}] ${incident.type} — ${incident.host || 'platform'}`,
      description: `*Incident ID:* ${incident.id}\n*Severity:* ${incident.severity.toUpperCase()}\n*Host:* ${incident.host || 'N/A'}\n*Detected:* ${incident.createdAt}\n\n*Description:*\n${incident.description}\n\n*Recommended Action:*\n${incident.recommendedAction || 'Investigate via the InfraMind-SentinelX dashboard.'}`,
      issuetype: { name: config.issueType },
      priority: { name: priority },
      labels: ['automated', 'inframind-sentinelx', `severity-${incident.severity.toLowerCase()}`],
    },
  };

  try {
    const response = await fetch(`${config.baseUrl}/rest/api/2/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(config),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `Jira API returned ${response.status}: ${errText.substring(0, 300)}` };
    }

    const data: any = await response.json();
    return {
      ok: true,
      issueKey: data.key,
      issueUrl: `${config.baseUrl}/browse/${data.key}`,
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Create a ticket for an anomaly (less severe than an incident)
export async function createAnomalyTicket(anomaly: {
  id: string;
  host: string;
  metric: string;
  value: number;
  expected: number;
  algorithm: string;
}): Promise<{ ok: boolean; issueKey?: string; issueUrl?: string; error?: string }> {
  const { config, error } = await getConfig();
  if (!config) return { ok: false, error };

  const body = {
    fields: {
      project: { key: config.projectKey },
      summary: `[ANOMALY] ${anomaly.host} ${anomaly.metric} — ${anomaly.algorithm}`,
      description: `*Anomaly ID:* ${anomaly.id}\n*Host:* ${anomaly.host}\n*Metric:* ${anomaly.metric}\n*Algorithm:* ${anomaly.algorithm}\n\n*Observed:* ${anomaly.value}\n*Expected:* ${anomaly.expected}\n\n_Detected automatically by InfraMind-SentinelX Anomaly Detection Engine._`,
      issuetype: { name: config.issueType },
      priority: { name: 'Low' },
      labels: ['anomaly', 'automated', 'inframind-sentinelx'],
    },
  };

  try {
    const response = await fetch(`${config.baseUrl}/rest/api/2/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(config),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `Jira API returned ${response.status}: ${errText.substring(0, 300)}` };
    }

    const data: any = await response.json();
    return {
      ok: true,
      issueKey: data.key,
      issueUrl: `${config.baseUrl}/browse/${data.key}`,
    };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// Test the Jira connection by fetching the project
export async function testJiraConnection(): Promise<{ ok: boolean; project?: any; error?: string }> {
  const { config, error } = await getConfig();
  if (!config) return { ok: false, error };

  try {
    const response = await fetch(`${config.baseUrl}/rest/api/2/project/${config.projectKey}`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader(config),
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return { ok: false, error: `Jira API returned ${response.status}` };
    }

    const data = await response.json();
    return { ok: true, project: { key: data.key, name: data.name, style: data.style } };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
