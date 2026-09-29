// LLM Client — z-ai-web-dev-sdk with RAG grounding
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { retrieve } from '@/lib/rag/engine';

export interface ChatContext {
  metricsCount: number; incidentsCount: number; anomaliesCount: number;
  threatsCount: number; eventsCount: number; sources: string[];
  liveData: any; ragDocs?: any[];
}

const SYSTEM_PROMPT = `You are InfraMind-SentinelX AI, a Senior Site Reliability and Security Operations engineer embedded in an enterprise AIOps + EDR + SOAR platform.

You monitor infrastructure (CPU, memory, disk, network, containers, K8s) and security (process monitoring, file activity, registry changes, network connections, threat detection with MITRE ATT&CK mapping).

RULES:
- Use ONLY the live context provided — never invent hosts, metrics, or numbers.
- Cite hosts, PIDs, metric values, percentages, and timestamps.
- Keep answers under 300 words unless asked for detail.
- If data is unavailable, say so honestly.
- For security questions, leverage the RAG context if provided.
- Recommend concrete actions (isolate, quarantine, create backup, trigger response workflow).`;

export async function buildChatContext(): Promise<ChatContext> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [latestMetrics, openIncidents, activeAnomalies, threats, securityEvents, recommendations, healthScores, riskScores, recentLogs, containers] = await Promise.all([
    db.metric.findMany({ orderBy: { ts: 'desc' }, take: 80 }),
    db.incident.findMany({ where: { status: { in: ['open', 'acknowledged'] } }, orderBy: { createdAt: 'desc' }, take: 15 }),
    db.anomaly.findMany({ where: { resolved: false }, orderBy: { ts: 'desc' }, take: 15 }),
    db.threat.findMany({ where: { status: { in: ['open', 'investigating'] } }, orderBy: { createdAt: 'desc' }, take: 15 }),
    db.securityEvent.findMany({ where: { classification: { in: ['suspicious', 'malicious', 'ransomware'] } }, orderBy: { timestamp: 'desc' }, take: 20 }),
    db.recommendation.findMany({ where: { applied: false }, orderBy: { createdAt: 'desc' }, take: 10 }),
    db.healthScore.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
    db.riskScore.findMany({ orderBy: { ts: 'desc' }, take: 30 }),
    db.logEntry.findMany({ orderBy: { ts: 'desc' }, take: 10 }),
    db.container.findMany({ orderBy: { name: 'asc' }, take: 20 }),
  ]);
  const latestByHostMetric: Record<string, any> = {};
  for (const m of latestMetrics) { const key = `${m.host}:${m.metric}`; if (!(key in latestByHostMetric)) latestByHostMetric[key] = m; }
  return {
    metricsCount: latestMetrics.length, incidentsCount: openIncidents.length, anomaliesCount: activeAnomalies.length,
    threatsCount: threats.length, eventsCount: securityEvents.length,
    sources: ['metrics', 'incidents', 'anomalies', 'threats', 'events', 'recommendations', 'logs', 'containers'],
    liveData: { metrics: Object.values(latestByHostMetric), incidents: openIncidents, anomalies: activeAnomalies, threats, events: securityEvents, recommendations, healthScores, riskScores, logs: recentLogs, containers },
  };
}

export function renderContext(ctx: ChatContext): string {
  const lines: string[] = [];
  lines.push(`# Live Platform Context (${new Date().toISOString()})`);
  lines.push(`- Metrics: ${ctx.metricsCount}, Incidents: ${ctx.incidentsCount}, Anomalies: ${ctx.anomaliesCount}, Threats: ${ctx.threatsCount}, Suspicious Events: ${ctx.eventsCount}`);
  const d = ctx.liveData;
  if (d.metrics.length > 0) { lines.push('## Latest Metrics'); for (const m of d.metrics.slice(0, 20)) lines.push(`- ${m.host}/${m.metric} = ${m.value}${m.unit} (${m.ts.toISOString()})`); }
  if (d.incidents.length > 0) { lines.push('## Open Incidents'); for (const i of d.incidents.slice(0, 10)) lines.push(`- [${i.severity}] ${i.affected}: ${i.reason}`); }
  if (d.anomalies.length > 0) { lines.push('## Active Anomalies'); for (const a of d.anomalies.slice(0, 10)) lines.push(`- [${a.severity}] ${a.host}/${a.metric} value=${a.value} (algo=${a.algorithm}, score=${a.score})`); }
  if (d.threats.length > 0) { lines.push('## Active Threats'); for (const t of d.threats.slice(0, 10)) lines.push(`- [${t.severity}] ${t.threatType} ${t.mitreAttackId || ''}: ${t.description}`); }
  if (d.events.length > 0) { lines.push('## Recent Suspicious Events'); for (const e of d.events.slice(0, 10)) lines.push(`- [${e.classification}] ${e.eventType} score=${e.threatScore} host=${e.host}`); }
  if (ctx.ragDocs && ctx.ragDocs.length > 0) { lines.push('## Retrieved Knowledge (RAG)'); for (const doc of ctx.ragDocs.slice(0, 3)) { lines.push(`### ${doc.title} [${doc.source}] (score: ${doc.score})`); lines.push(doc.content); } }
  return lines.join('\n');
}

export async function chat(userMessage: string, history?: { role: string; content: string }[], ragDocs?: any[]): Promise<{ reply: string; context: ChatContext }> {
  const ctx = await buildChatContext();
  if (ragDocs) ctx.ragDocs = ragDocs;
  const contextBlock = renderContext(ctx);
  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: contextBlock },
    ...(history || []).slice(-6).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
    { role: 'user', content: userMessage },
  ];
  let reply = '';
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({ messages, temperature: 0.4, max_tokens: 800 } as any);
    reply = completion.choices[0]?.message?.content?.trim() || '';
  } catch (e: any) {
    reply = `[InfraMind-SentinelX fallback] LLM unavailable (${e?.message}).\n\n` + fallbackReply(userMessage, ctx);
  }
  await db.chatMessage.createMany({ data: [
    { role: 'user', content: userMessage, metadata: '{}' },
    { role: 'assistant', content: reply, metadata: JSON.stringify({ ts: new Date().toISOString() }), context: contextBlock.substring(0, 5000) },
  ] });
  return { reply, context: ctx };
}

function fallbackReply(msg: string, ctx: ChatContext): string {
  const d = ctx.liveData;
  if (msg.toLowerCase().includes('cpu') || msg.includes('memory')) {
    const metrics = (d.metrics || []).filter((m: any) => msg.toLowerCase().includes('cpu') ? m.metric === 'cpu' : m.metric.startsWith('memory'));
    if (metrics.length === 0) return 'No matching metrics found.';
    return metrics.slice(0, 5).map((m: any) => `${m.host}/${m.metric} = ${m.value}${m.unit}`).join('\n');
  }
  if (msg.toLowerCase().includes('incident')) {
    if (!d.incidents.length) return 'No open incidents.';
    return d.incidents.slice(0, 5).map((i: any) => `[${i.severity}] ${i.affected}: ${i.reason}`).join('\n');
  }
  return `Context: ${ctx.metricsCount} metrics, ${ctx.incidentsCount} incidents, ${ctx.anomaliesCount} anomalies, ${ctx.threatsCount} threats.`;
}