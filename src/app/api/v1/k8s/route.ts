// GET /api/v1/k8s — real Kubernetes cluster telemetry (with DB fallback)

import { NextResponse } from 'next/server';
import { collectKubernetes } from '@/lib/collectors/kubernetes';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const live = collectKubernetes();

  // Also fetch DB rows grouped by kind for historical context
  const dbRows = await db.k8sResource.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
  const groups: Record<string, any[]> = {};
  for (const r of dbRows) {
    if (!groups[r.kind]) groups[r.kind] = [];
    groups[r.kind].push({
      id: r.id,
      namespace: r.namespace,
      name: r.name,
      status: r.status,
      ready: r.ready,
      cpu: r.cpu,
      memory: r.memory,
      updatedAt: r.updatedAt.toISOString(),
    });
  }

  return NextResponse.json({
    live: {
      available: live.available,
      reason: live.reason,
      version: live.version,
      totalPods: live.totalPods ?? 0,
      totalDeployments: live.totalDeployments ?? 0,
      namespaces: live.namespaces,
      nodes: live.nodes,
      resources: live.resources,
    },
    persisted: {
      count: dbRows.length,
      groups,
    },
  });
}
