// Platform Observability + SLO Engine — monitor the security platform itself

import { db } from '@/lib/db';

// Default SLOs
export const DEFAULT_SLOS = [
  { name: 'Telemetry Ingestion', description: 'Event ingestion availability', target: 99.9, unit: '%', window: '30d' },
  { name: 'Threat Detection Latency', description: 'Time from event to threat classification', target: 2.0, unit: 'seconds', window: '30d' },
  { name: 'Critical Alert Latency', description: 'Time to alert on critical threats', target: 5.0, unit: 'seconds', window: '30d' },
  { name: 'Agent Response Time', description: 'Agent task execution time', target: 30.0, unit: 'seconds', window: '30d' },
  { name: 'Recovery Time (RTO)', description: 'Time to restore from backup', target: 5.0, unit: 'minutes', window: '30d' },
  { name: 'API Error Rate', description: 'API error rate', target: 0.5, unit: '%', window: '30d' },
  { name: 'RAG Retrieval Latency', description: 'Knowledge base retrieval time', target: 200, unit: 'ms', window: '30d' },
  { name: 'LLM Response Latency', description: 'LLM chat response time', target: 3.0, unit: 'seconds', window: '30d' },
];

// Ensure SLOs are seeded
export async function ensureSLOsSeeded(): Promise<void> {
  const existing = await db.sLO.count();
  if (existing > 0) return;
  for (const slo of DEFAULT_SLOS) {
    await db.sLO.create({
      data: {
        name: slo.name,
        description: slo.description,
        target: slo.target,
        unit: slo.unit,
        window: slo.window,
        current: slo.target * (0.95 + Math.random() * 0.05),
        status: 'meeting',
      },
    });
  }
}

// Record a platform metric (latency, error rate, throughput)
export async function recordPlatformMetric(metric: string, value: number, unit: string = 'ms', endpoint?: string, metadata?: Record<string, any>): Promise<void> {
  await db.platformMetric.create({
    data: {
      metric,
      value,
      unit,
      endpoint,
      metadata: JSON.stringify(metadata || {}),
    },
  });

  // Update relevant SLO if applicable
  const sloMap: Record<string, string> = {
    'threat_detection_latency': 'Threat Detection Latency',
    'critical_alert_latency': 'Critical Alert Latency',
    'agent_response_time': 'Agent Response Time',
    'api_error_rate': 'API Error Rate',
    'rag_retrieval_latency': 'RAG Retrieval Latency',
    'llm_response_latency': 'LLM Response Latency',
  };

  const sloName = sloMap[metric];
  if (sloName) {
    const slo = await db.sLO.findUnique({ where: { name: sloName } });
    if (slo) {
      // For error rate: lower is better, target is max
      // For latency: lower is better, target is max
      // For availability: higher is better, target is min
      const isLowerBetter = slo.unit !== '%';
      const current = isLowerBetter ? value : 100 - value;

      let status = 'meeting';
      if (isLowerBetter) {
        if (value > slo.target * 1.5) status = 'breaching';
        else if (value > slo.target * 1.2) status = 'at_risk';
      } else {
        if (current < slo.target * 0.9) status = 'breaching';
        else if (current < slo.target * 0.95) status = 'at_risk';
      }

      await db.sLO.update({
        where: { id: slo.id },
        data: { current, status },
      });
    }
  }
}

// Get platform health dashboard
export async function getPlatformHealth(): Promise<{
  slos: any[];
  recentMetrics: any[];
  overallSloCompliance: number;
  errorRate: number;
  throughput: number;
}> {
  await ensureSLOsSeeded();

  const slos = await db.sLO.findMany();
  const recentMetrics = await db.platformMetric.findMany({
    orderBy: { ts: 'desc' },
    take: 50,
  });

  const meetingCount = slos.filter((s) => s.status === 'meeting').length;
  const overallCompliance = slos.length > 0 ? (meetingCount / slos.length) * 100 : 0;

  // Get latest error rate
  const latestErrorRate = await db.platformMetric.findFirst({
    where: { metric: 'api_error_rate' },
    orderBy: { ts: 'desc' },
  });

  // Get event processing throughput
  const since = new Date(Date.now() - 60 * 1000); // last minute
  const eventsLastMinute = await db.unifiedSecurityEvent.count({ where: { timestamp: { gte: since } } });

  return {
    slos: slos.map((s) => ({
      name: s.name, description: s.description, target: s.target, current: Math.round(s.current * 100) / 100,
      unit: s.unit, status: s.status, window: s.window,
    })),
    recentMetrics: recentMetrics.map((m) => ({
      metric: m.metric, value: m.value, unit: m.unit, endpoint: m.endpoint, ts: m.ts.toISOString(),
    })),
    overallSloCompliance: Math.round(overallCompliance * 100) / 100,
    errorRate: latestErrorRate?.value || 0.2,
    throughput: eventsLastMinute,
  };
}

// Simulate recording platform metrics (in production these would be collected from real monitoring)
export async function recordSimulatedPlatformMetrics(): Promise<{ recorded: number }> {
  // Record API latency
  await recordPlatformMetric('api_latency_ms', 50 + Math.random() * 100, 'ms', '/api/v1/overview');
  await recordPlatformMetric('api_latency_ms', 30 + Math.random() * 50, 'ms', '/api/v1/live');
  await recordPlatformMetric('api_latency_ms', 100 + Math.random() * 200, 'ms', '/api/v1/ai/chat');

  // Record event processing rate
  const eventCount = await db.unifiedSecurityEvent.count({ where: { timestamp: { gte: new Date(Date.now() - 60000) } } });
  await recordPlatformMetric('event_processing_rate', eventCount, 'events/min');

  // Record RAG latency
  await recordPlatformMetric('rag_retrieval_latency', 100 + Math.random() * 150, 'ms');

  // Record LLM latency
  await recordPlatformMetric('llm_response_latency', 1.5 + Math.random() * 1.5, 'seconds');

  // Record error rate
  await recordPlatformMetric('api_error_rate', Math.random() * 0.5, '%');

  // Record threat detection latency
  await recordPlatformMetric('threat_detection_latency', 1.0 + Math.random() * 1.5, 'seconds');

  // Record agent response time
  const recentTasks = await db.agentTask.findMany({ where: { status: 'completed', duration: { not: null } }, orderBy: { completedAt: 'desc' }, take: 10 });
  if (recentTasks.length > 0) {
    const avgDuration = recentTasks.reduce((sum, t) => sum + (t.duration || 0), 0) / recentTasks.length;
    await recordPlatformMetric('agent_response_time', avgDuration / 1000, 'seconds');
  }

  return { recorded: 7 };
}