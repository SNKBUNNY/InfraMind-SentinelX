// Kubernetes collector — real cluster telemetry via `kubectl`.
// Reads Pods / Deployments / Namespaces / Nodes from a reachable cluster.
// Falls back to "available: false" when kubectl is missing or no cluster
// is reachable — NEVER fabricates resources.

import { execSync } from 'child_process';
import { db } from '@/lib/db';

export interface K8sResource {
  kind: string; // Pod | Deployment | Service | Namespace | Node
  namespace: string;
  name: string;
  status: string;
  ready: string;
  cpu: number; // millicores
  memory: number; // Mi
  restarts: number;
  age: string;
  node?: string;
}

export interface K8sNode {
  name: string;
  status: string;
  roles: string;
  version: string;
  cpu: number;
  memory: number; // Mi
}

export interface K8sAvailability {
  available: boolean;
  reason?: string;
  version?: string;
  resources: K8sResource[];
  nodes: K8sNode[];
  namespaces: string[];
  totalPods?: number;
  totalDeployments?: number;
}

function isKubectlAvailable(): boolean {
  try {
    execSync('which kubectl', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function isClusterReachable(): boolean {
  try {
    execSync('kubectl cluster-info', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function getKubectlVersion(): string | undefined {
  try {
    return execSync('kubectl version --client --short 2>/dev/null || kubectl version --client', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 2000,
    }).trim();
  } catch {
    return undefined;
  }
}

function ageFrom(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d`;
    const hours = Math.floor(diff / 3600000);
    if (hours > 0) return `${hours}h`;
    const mins = Math.floor(diff / 60000);
    if (mins > 0) return `${mins}m`;
    return `${Math.floor(diff / 1000)}s`;
  } catch {
    return '';
  }
}

function parseMillicores(s: string): number {
  return parseInt(s.replace('m', '')) || 0;
}

function parseMi(s: string): number {
  s = s.trim();
  if (s.endsWith('Mi')) return parseInt(s) || 0;
  if (s.endsWith('Gi')) return (parseInt(s) || 0) * 1024;
  if (s.endsWith('Ki')) return Math.round((parseInt(s) || 0) / 1024);
  if (s.endsWith('M')) return parseInt(s) || 0;
  if (s.endsWith('G')) return (parseInt(s) || 0) * 1024;
  return parseInt(s) || 0;
}

function parseMemKi(s: string): number {
  return Math.round(parseInt(s) / 1024) || 0;
}

export function collectKubernetes(): K8sAvailability {
  if (!isKubectlAvailable()) {
    return {
      available: false,
      reason:
        'kubectl not found on this host. Install kubectl and a local cluster (minikube or kind) to enable Kubernetes monitoring.',
      resources: [],
      nodes: [],
      namespaces: [],
    };
  }
  if (!isClusterReachable()) {
    return {
      available: false,
      reason:
        'No Kubernetes cluster reachable. Start one with `minikube start` or `kind create cluster`.',
      resources: [],
      nodes: [],
      namespaces: [],
      version: getKubectlVersion(),
    };
  }

  const version = getKubectlVersion();
  const resources: K8sResource[] = [];
  const namespaces: string[] = [];
  const nodes: K8sNode[] = [];

  // Pods across all namespaces
  try {
    const podJson = execSync('kubectl get pods -A -o json', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 10000,
    });
    const parsed = JSON.parse(podJson);
    for (const item of parsed.items ?? []) {
      const meta = item.metadata || {};
      const spec = item.spec || {};
      const status = item.status || {};
      const containerStatuses = status.containerStatuses || [];
      const restarts = containerStatuses.reduce((a: number, c: any) => a + (c.restartCount || 0), 0);
      const ready =
        containerStatuses.length > 0
          ? `${containerStatuses.filter((c: any) => c.ready).length}/${containerStatuses.length}`
          : '0/0';
      resources.push({
        kind: 'Pod',
        namespace: meta.namespace || 'default',
        name: meta.name || '',
        status: status.phase || 'Unknown',
        ready,
        cpu: 0,
        memory: 0,
        restarts,
        age: meta.creationTimestamp ? ageFrom(meta.creationTimestamp) : '',
        node: spec.nodeName,
      });
    }
  } catch {
    // ignore — no pods or permission error
  }

  // Namespaces
  try {
    const ns = execSync('kubectl get ns -o name', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
    for (const line of ns.trim().split('\n').filter(Boolean)) {
      namespaces.push(line.replace(/^namespace\//, ''));
    }
  } catch {
    // ignore
  }

  // Deployments
  try {
    const dep = execSync(
      'kubectl get deploy -A -o custom-columns=NS:.metadata.namespace,NAME:.metadata.name,READY:.status.readyReplicas,REQ:.spec.replicas --no-headers',
      { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 },
    );
    for (const line of dep.trim().split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        resources.push({
          kind: 'Deployment',
          namespace: parts[0],
          name: parts[1],
          status: parts[2] === parts[3] ? 'Available' : 'Progressing',
          ready: `${parts[2] ?? 0}/${parts[3]}`,
          cpu: 0,
          memory: 0,
          restarts: 0,
          age: '',
        });
      }
    }
  } catch {
    // ignore
  }

  // Nodes (capacity)
  try {
    const nodeJson = execSync('kubectl get nodes -o json', { encoding: 'utf-8', stdio: 'pipe', timeout: 5000 });
    const parsed = JSON.parse(nodeJson);
    for (const item of parsed.items ?? []) {
      const meta = item.metadata || {};
      const status = item.status || {};
      const conditions = status.conditions || [];
      const readyCond = conditions.find((c: any) => c.type === 'Ready');
      const roleLabels = Object.entries(meta.labels || {})
        .filter(([k]) => k.startsWith('node-role.kubernetes.io/'))
        .map(([k]) => k.replace('node-role.kubernetes.io/', ''));
      nodes.push({
        name: meta.name,
        status: readyCond?.status === 'True' ? 'Ready' : 'NotReady',
        roles: roleLabels.join(',') || 'worker',
        version: status.nodeInfo?.kubeletVersion ?? '',
        cpu: parseInt(status.capacity?.cpu ?? '0') || 0,
        memory: parseMemKi(status.capacity?.memory ?? '0'),
      });
    }
  } catch {
    // ignore
  }

  // Live CPU/memory per pod via `kubectl top` (requires metrics-server)
  try {
    const top = execSync('kubectl top pods -A --no-headers', {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 5000,
    });
    for (const line of top.trim().split('\n').filter(Boolean)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const ns = parts[0];
        const name = parts[1];
        const cpu = parseMillicores(parts[2]);
        const mem = parseMi(parts[3]);
        const r = resources.find((x) => x.kind === 'Pod' && x.namespace === ns && x.name === name);
        if (r) {
          r.cpu = cpu;
          r.memory = mem;
        }
      }
    }
  } catch {
    // metrics-server not installed — CPU/mem will be 0, which is honest
  }

  return {
    available: true,
    resources,
    nodes,
    namespaces,
    version,
    totalPods: resources.filter((r) => r.kind === 'Pod').length,
    totalDeployments: resources.filter((r) => r.kind === 'Deployment').length,
  };
}

// Persist the latest K8s snapshot into Prisma so the dashboard can list
// resources without re-querying the cluster on every page load.
export async function persistKubernetesSnapshot(): Promise<{ collected: number; upserted: number }> {
  const result = collectKubernetes();
  if (!result.available) return { collected: 0, upserted: 0 };

  let count = 0;
  for (const r of result.resources) {
    const key = `${r.kind}|${r.namespace}|${r.name}`;
    await db.k8sResource.upsert({
      where: { id: key },
      create: {
        id: key,
        kind: r.kind,
        namespace: r.namespace,
        name: r.name,
        status: r.status,
        ready: r.ready,
        cpu: r.cpu,
        memory: r.memory,
      },
      update: {
        status: r.status,
        ready: r.ready,
        cpu: r.cpu,
        memory: r.memory,
      },
    });
    count++;
  }

  return { collected: result.resources.length, upserted: count };
}
