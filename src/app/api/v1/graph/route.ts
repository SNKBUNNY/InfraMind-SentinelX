import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { collectSystem } from '@/lib/collectors/system';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

async function upsertNode(nodeType: string, name: string, host: string | null, properties: any = {}, riskScore = 0) {
  const existing = await db.graphNode.findFirst({ where: { nodeType, name, host: host || null } });
  if (existing) {
    return db.graphNode.update({ where: { id: existing.id }, data: { properties: JSON.stringify({ ...JSON.parse(existing.properties || '{}'), ...properties }), riskScore: Math.max(existing.riskScore, riskScore), lastSeenAt: new Date() } });
  }
  return db.graphNode.create({ data: { nodeType, name, host, properties: JSON.stringify(properties), riskScore } });
}

async function upsertEdge(fromId: string, toId: string, edgeType: string) {
  const existing = await db.graphEdge.findFirst({ where: { fromId, toId, edgeType } });
  if (existing) return;
  try { await db.graphEdge.create({ data: { fromId, toId, edgeType } }); } catch {}
}

export async function GET() {
  try {
    const sys = collectSystem();
    const hostName = sys.host;
    const orgNode = await upsertNode('organization', 'Organization', null, { hostname: hostName }, 0);
    const hostNode = await upsertNode('host', hostName, hostName, { cpu: sys.cpuPercent, memory: sys.memoryPercent, disk: sys.diskPercent }, sys.cpuPercent > 80 ? 70 : 30);
    await upsertEdge(orgNode.id, hostNode.id, 'contains');

    try {
      const out = execSync('ps -eo pid,comm,pcpu,pmem,rss,user --sort=-pcpu 2>/dev/null | head -n 11', { encoding: 'utf8' });
      const lines = out.trim().split('\n').slice(1);
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 6) continue;
        const pid = parts[0]; const name = parts[1]; const user = parts[5];
        const procNode = await upsertNode('process', `${name}:${pid}`, hostName, { pid: Number(pid), name, user }, 10);
        await upsertEdge(procNode.id, hostNode.id, 'runs_on');
        if (user && user !== 'root') {
          const userNode = await upsertNode('user', user, hostName, { username: user }, 0);
          await upsertEdge(procNode.id, userNode.id, 'accessed_by');
          await upsertEdge(orgNode.id, userNode.id, 'contains');
        }
      }
    } catch {}

    const nodes = await db.graphNode.findMany({ orderBy: { riskScore: 'desc' }, take: 200 });
    const edges = await db.graphEdge.findMany({ take: 500 });
    const byType: Record<string, number> = {};
    for (const n of nodes) byType[n.nodeType] = (byType[n.nodeType] || 0) + 1;
    return NextResponse.json({
      nodes: nodes.map(n => ({ id: n.id, nodeType: n.nodeType, name: n.name, host: n.host, riskScore: n.riskScore, status: n.status, properties: JSON.parse(n.properties || '{}'), lastSeenAt: n.lastSeenAt.toISOString() })),
      edges: edges.map(e => ({ id: e.id, from: e.fromId, to: e.toId, edgeType: e.edgeType, weight: e.weight })),
      summary: { totalNodes: nodes.length, totalEdges: edges.length, byType, highRisk: nodes.filter(n => n.riskScore > 60).length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}