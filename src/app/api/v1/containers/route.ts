// GET /api/v1/containers — real Docker container telemetry (with DB fallback)

import { NextResponse } from 'next/server';
import { collectDocker } from '@/lib/collectors/docker';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const live = collectDocker();

  // Also fetch latest DB rows for historical context
  const dbRows = await db.container.findMany({ orderBy: { name: 'asc' } });

  return NextResponse.json({
    live: {
      available: live.available,
      reason: live.reason,
      version: live.version,
      totalContainers: live.totalContainers ?? 0,
      runningContainers: live.runningContainers ?? 0,
      containers: live.containers,
    },
    persisted: {
      count: dbRows.length,
      containers: dbRows.map((c) => ({
        id: c.id,
        name: c.name,
        image: c.image,
        status: c.status,
        health: c.health,
        cpu: c.cpu,
        memory: c.memory,
        memoryLimit: c.memoryLimit,
        memPct: c.memoryLimit ? Math.round((c.memory / c.memoryLimit) * 100) : 0,
        restartCount: c.restartCount,
        startedAt: c.startedAt?.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
    },
  });
}
