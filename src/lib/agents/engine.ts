// Agentic AI Engine — 4 specialized agents with real-time execution via AI Gateway
import { db } from '@/lib/db';
import { analyzeEvent } from '@/lib/security/threat-engine';
import { retrieve } from '@/lib/rag/engine';
import { executeTool } from '@/lib/engines/ai-gateway';
import { recordAuditEvent } from '@/lib/engines/audit-trail';

export const AGENT_CONFIGS = [
  { name: 'Investigation Agent', type: 'investigation', description: 'Forensic timeline reconstruction via event correlation', capabilities: ['query_events', 'query_processes', 'query_network', 'correlate_timeline', 'retrieve_knowledge'] },
  { name: 'Threat Agent', type: 'threat', description: 'MITRE ATT&CK mapping, IOC extraction, containment recommendations', capabilities: ['analyze_threat', 'map_mitre_attack', 'identify_iocs', 'recommend_containment', 'retrieve_knowledge'] },
  { name: 'Infrastructure Agent', type: 'infrastructure', description: 'Anomaly analysis, capacity planning, remediation advice', capabilities: ['query_metrics', 'query_anomalies', 'recommend_remediation'] },
  { name: 'Recovery Agent', type: 'recovery', description: 'AES-256-GCM backups, integrity verification, restore operations', capabilities: ['create_backup', 'verify_integrity', 'restore_backup'] },
];

export async function ensureAgentsSeeded(): Promise<void> {
  for (const cfg of AGENT_CONFIGS) {
    const existing = await db.agent.findUnique({ where: { name: cfg.name } });
    if (!existing) {
      await db.agent.create({ data: { name: cfg.name, type: cfg.type, description: cfg.description, status: 'idle', capabilities: JSON.stringify(cfg.capabilities) } });
    }
  }
}

export interface AgentTaskInput {
  taskType: string; target?: string; host?: string; incidentId?: string; eventId?: string; query?: string;
  timeWindow?: { start: string; end: string }; options?: Record<string, any>;
}

export async function executeAgentTask(agentId: string, input: AgentTaskInput): Promise<any> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error(`Agent ${agentId} not found`);

  await db.agent.update({ where: { id: agentId }, data: { status: 'running', lastRunAt: new Date() } });
  const task = await db.agentTask.create({ data: { agentId, status: 'running', input: JSON.stringify(input), startedAt: new Date() } });

  const steps: any[] = [];
  const toolsUsed: string[] = [];
  let output: Record<string, any> = {};
  let reasoning = '';
  let status: 'completed' | 'failed' = 'completed';
  let error: string | undefined;

  try {
    if (agent.type === 'investigation') {
      const result = await runInvestigation(input, agent.name);
      steps.push(...result.steps); toolsUsed.push(...result.toolsUsed); output = result.output; reasoning = result.reasoning;
    } else if (agent.type === 'threat') {
      const result = await runThreat(input, agent.name);
      steps.push(...result.steps); toolsUsed.push(...result.toolsUsed); output = result.output; reasoning = result.reasoning;
    } else if (agent.type === 'infrastructure') {
      const result = await runInfrastructure(input, agent.name);
      steps.push(...result.steps); toolsUsed.push(...result.toolsUsed); output = result.output; reasoning = result.reasoning;
    } else if (agent.type === 'recovery') {
      const result = await runRecovery(input, agent.name);
      steps.push(...result.steps); toolsUsed.push(...result.toolsUsed); output = result.output; reasoning = result.reasoning;
    }
  } catch (e: any) { status = 'failed'; error = e.message; }

  await db.agentTask.update({ where: { id: task.id }, data: { status, steps: JSON.stringify(steps), toolsUsed: JSON.stringify(toolsUsed), output: JSON.stringify(output), reasoning, error, completedAt: new Date(), duration: Date.now() - task.startedAt!.getTime() } });
  await db.agent.update({ where: { id: agentId }, data: { status: 'idle' } });
  return { status, steps, toolsUsed, output, reasoning };
}

async function runInvestigation(input: AgentTaskInput, agentName: string) {
  const steps: any[] = []; const toolsUsed: string[] = []; let stepNum = 1;
  const t0 = Date.now();
  const windowStart = input.timeWindow?.start ? new Date(input.timeWindow.start) : new Date(Date.now() - 60 * 60 * 1000);
  const events = await db.securityEvent.findMany({ where: { timestamp: { gte: windowStart } }, orderBy: { timestamp: 'asc' }, take: 200 });
  toolsUsed.push('query_events');
  steps.push({ step: stepNum++, name: 'Query events in time window', thought: `Gathering events between ${windowStart.toISOString()} and now.`, action: 'query_events', input: {}, output: { count: events.length }, duration: Date.now() - t0, timestamp: new Date(t0).toISOString() });

  const t1 = Date.now();
  const suspicious = events.filter((e) => e.classification !== 'benign' || e.threatScore > 0);
  const byHost: Record<string, any[]> = {};
  for (const e of events) { const k = e.host || e.agentId; if (!byHost[k]) byHost[k] = []; byHost[k].push(e); }
  toolsUsed.push('correlate_timeline');
  steps.push({ step: stepNum++, name: 'Correlate events by host', thought: `Found ${events.length} events across ${Object.keys(byHost).length} hosts. ${suspicious.length} suspicious.`, action: 'correlate_timeline', input: {}, output: { suspiciousCount: suspicious.length, hosts: Object.keys(byHost) }, duration: Date.now() - t1, timestamp: new Date(t1).toISOString() });

  const t2 = Date.now();
  const docs = await retrieve(input.query || `investigation ${suspicious[0]?.eventType || 'process'}`, 3);
  toolsUsed.push('retrieve_knowledge');
  steps.push({ step: stepNum++, name: 'Retrieve knowledge', thought: 'Querying knowledge base for context.', action: 'retrieve_knowledge', input: { query: input.query }, output: { docsFound: docs.length }, duration: Date.now() - t2, timestamp: new Date(t2).toISOString() });

  const reasoning = `Investigation complete: ${events.length} events, ${suspicious.length} suspicious, across ${Object.keys(byHost).length} hosts. ${docs.length} knowledge docs retrieved.`;
  return { status: 'completed', steps, toolsUsed, output: { timeline: suspicious.slice(0, 10), totalEvents: events.length, suspiciousCount: suspicious.length, hosts: Object.keys(byHost), knowledgeContext: docs.map((d) => ({ title: d.title, score: d.score })) }, reasoning };
}

async function runThreat(input: AgentTaskInput, agentName: string) {
  const steps: any[] = []; const toolsUsed: string[] = []; let stepNum = 1;
  const t0 = Date.now();
  let targetEvent: any = null;
  if (input.eventId) targetEvent = await db.securityEvent.findUnique({ where: { id: input.eventId } });
  if (!targetEvent) targetEvent = await db.securityEvent.findFirst({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] } }, orderBy: { timestamp: 'desc' } });
  toolsUsed.push('query_events');
  steps.push({ step: stepNum++, name: 'Fetch target event', thought: 'Finding target event to analyze.', action: 'query_events', input: {}, output: { found: !!targetEvent }, duration: Date.now() - t0, timestamp: new Date(t0).toISOString() });

  if (!targetEvent) return { status: 'completed', steps, toolsUsed, output: { error: 'No target event found' }, reasoning: 'No event found.' };
  let rawData: any = {}; try { rawData = JSON.parse(targetEvent.rawData || '{}'); } catch {}
  const t1 = Date.now();
  const analysis = analyzeEvent(targetEvent.eventType, rawData);
  toolsUsed.push('analyze_threat');
  steps.push({ step: stepNum++, name: 'Analyze threat indicators', thought: `Running threat analysis on ${targetEvent.eventType} event.`, action: 'analyze_threat', input: {}, output: { score: analysis.threatScore, classification: analysis.classification, mitre: analysis.mitreAttackId }, duration: Date.now() - t1, timestamp: new Date(t1).toISOString() });

  // Use AI Gateway to execute a tool if threat is high
  if (analysis.threatScore >= 70) {
    const t2 = Date.now();
    const toolResult = await executeTool({
      toolName: analysis.threatType === 'ransomware' ? 'isolate_host' : 'notify',
      agentName,
      parameters: { target: targetEvent.host, threatId: targetEvent.id, reason: analysis.description },
      threatScore: analysis.threatScore,
    });
    toolsUsed.push('ai_gateway:execute_tool');
    steps.push({ step: stepNum++, name: 'Execute response via AI Gateway', thought: `Threat score ${analysis.threatScore} — executing response action via AI Gateway with autonomy check.`, action: 'execute_tool', input: { toolName: analysis.threatType === 'ransomware' ? 'isolate_host' : 'notify' }, output: { status: toolResult.status, requiresApproval: toolResult.requiresApproval, message: toolResult.message }, duration: Date.now() - t2, timestamp: new Date(t2).toISOString() });
  }

  const reasoning = `Threat analysis: event ${targetEvent.id} classified as ${analysis.classification} (score ${analysis.threatScore}). MITRE: ${analysis.mitreAttackId}. Recommended: ${analysis.recommendedAction}`;
  return { status: 'completed', steps, toolsUsed, output: { eventId: targetEvent.id, threatScore: analysis.threatScore, classification: analysis.classification, mitre: { id: analysis.mitreAttackId, tactic: analysis.mitreTactic }, indicators: analysis.indicators, recommendedAction: analysis.recommendedAction }, reasoning };
}

async function runInfrastructure(input: AgentTaskInput, agentName: string) {
  const steps: any[] = []; const toolsUsed: string[] = []; let stepNum = 1;
  const t0 = Date.now();
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const metrics = await db.metric.findMany({ where: { ts: { gte: since } }, orderBy: { ts: 'desc' }, take: 100 });
  toolsUsed.push('query_metrics');
  steps.push({ step: stepNum++, name: 'Query recent metrics', thought: 'Fetching last 30 min of metrics.', action: 'query_metrics', input: {}, output: { count: metrics.length }, duration: Date.now() - t0, timestamp: new Date(t0).toISOString() });

  const t1 = Date.now();
  const anomalies = await db.anomaly.findMany({ where: { resolved: false }, orderBy: { ts: 'desc' }, take: 20 });
  toolsUsed.push('query_anomalies');
  steps.push({ step: stepNum++, name: 'Query anomalies', thought: 'Checking for active anomalies.', action: 'query_anomalies', input: {}, output: { count: anomalies.length }, duration: Date.now() - t1, timestamp: new Date(t1).toISOString() });

  const reasoning = `Infrastructure analysis: ${metrics.length} metrics, ${anomalies.length} anomalies.`;
  return { status: 'completed', steps, toolsUsed, output: { metricsCount: metrics.length, anomaliesCount: anomalies.length }, reasoning };
}

async function runRecovery(input: AgentTaskInput, agentName: string) {
  const steps: any[] = []; const toolsUsed: string[] = []; let stepNum = 1;
  const t0 = Date.now();
  // Use AI Gateway to create a backup (safe — low autonomy required)
  const toolResult = await executeTool({
    toolName: 'create_backup',
    agentName,
    parameters: { sourcePath: input.target || '/data/critical', reason: 'Agent-initiated backup' },
  });
  toolsUsed.push('ai_gateway:create_backup');
  steps.push({ step: stepNum++, name: 'Create backup via AI Gateway', thought: 'Initiating encrypted backup through the AI Gateway (tool registry).', action: 'create_backup', input: { sourcePath: input.target || '/data/critical' }, output: { status: toolResult.status, message: toolResult.message, requiresApproval: toolResult.requiresApproval }, duration: Date.now() - t0, timestamp: new Date(t0).toISOString() });

  const reasoning = `Recovery: backup created via AI Gateway. Status: ${toolResult.status}.`;
  return { status: 'completed', steps, toolsUsed, output: toolResult.result || { message: toolResult.message }, reasoning };
}