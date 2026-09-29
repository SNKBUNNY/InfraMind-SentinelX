// GET /api/v1/sentinelx/dashboard — SentinelX SOC dashboard summary

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { collectDocker } from '@/lib/collectors/docker';
import { collectKubernetes } from '@/lib/collectors/kubernetes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = await db.securityEvent.findMany({
    orderBy: { timestamp: 'desc' },
    take: 500,
  });

  const maxThreat = events.reduce((m, e) => Math.max(m, e.threatScore), 0);
  const activeIncidents = events.filter((e) => e.threatScore >= 50).length;
  const byType: Record<string, number> = {};
  for (const e of events) {
    byType[e.eventType] = (byType[e.eventType] || 0) + 1;
  }

  // Live infra status
  const docker = collectDocker();
  const k8s = collectKubernetes();

  return NextResponse.json({
    total_events: events.length,
    global_threat_score: maxThreat,
    active_incidents: activeIncidents,
    processes_monitored: byType['process'] || 0,
    files_monitored: byType['file'] || 0,
    network_connections: byType['network'] || 0,
    registry_events: byType['registry'] || 0,
    usb_events: byType['usb'] || 0,
    system_metrics: byType['system'] || 0,
    authentication_events: byType['authentication'] || 0,
    infra: {
      docker: {
        available: docker.available,
        reason: docker.reason,
        version: docker.version,
        total_containers: docker.totalContainers ?? 0,
        running_containers: docker.runningContainers ?? 0,
      },
      kubernetes: {
        available: k8s.available,
        reason: k8s.reason,
        version: k8s.version,
        total_pods: k8s.totalPods ?? 0,
        total_deployments: k8s.totalDeployments ?? 0,
        namespaces: k8s.namespaces.length,
        nodes: k8s.nodes.length,
      },
    },
    timestamp: new Date().toISOString(),
  });
}
