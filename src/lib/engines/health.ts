// Health + Risk scoring engine
import { db } from '@/lib/db';

export async function computeHealth(host: string) {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const metrics = await db.metric.findMany({ where: { host, ts: { gte: since } }, orderBy: { ts: 'desc' }, take: 200 });
  const latest: Record<string, number> = {};
  for (const m of metrics) if (!(m.metric in latest)) latest[m.metric] = m.value;
  const cpu = latest['cpu'] || 0;
  const memPct = latest['memory_percent'] || 0;
  const disk = latest['disk'] || 0;
  const subScore = (b: number) => Math.round(100 * (1 - Math.pow(Math.max(0, Math.min(1, b)), 1.5)));
  const cpuScore = subScore(Math.max(0, (cpu - 50) / 50));
  const memoryScore = subScore(Math.max(0, (memPct - 60) / 40));
  const diskScore = subScore(Math.max(0, (disk - 70) / 30));
  const openIncidents = await db.incident.count({ where: { status: { in: ['open', 'acknowledged'] } } });
  const criticalIncidents = await db.incident.count({ where: { severity: 'critical', status: { in: ['open', 'acknowledged'] } } });
  const incidentsScore = subScore(Math.min(1, openIncidents / 5 + criticalIncidents * 0.3));
  const errorLogs = await db.logEntry.count({ where: { host, level: { in: ['ERROR', 'FATAL'] }, ts: { gte: since } } });
  const logsScore = subScore(Math.min(1, errorLogs / 50));
  const forecasts = await db.forecast.findMany({ where: { host, ts: { gte: new Date() } }, take: 200 });
  const fcValues = forecasts.map((f) => f.value);
  const avgFc = fcValues.length > 0 ? fcValues.reduce((a, b) => a + b, 0) / fcValues.length : 0;
  const forecastScore = subScore(Math.max(0, (avgFc - 60) / 40));
  const score = Math.round(0.22 * cpuScore + 0.22 * memoryScore + 0.12 * diskScore + 0.14 * incidentsScore + 0.14 * logsScore + 0.16 * forecastScore);
  await db.healthScore.create({ data: { host, score, cpu: cpuScore, memory: memoryScore, disk: diskScore, logs: logsScore, incidents: incidentsScore, forecast: forecastScore } });
  return { score, breakdown: { cpu: cpuScore, memory: memoryScore, disk: diskScore, logs: logsScore, incidents: incidentsScore, forecast: forecastScore } };
}

export async function computeRisk(host: string) {
  const since = new Date(Date.now() - 30 * 60 * 1000);
  const metrics = await db.metric.findMany({ where: { host, ts: { gte: since } }, orderBy: { ts: 'desc' }, take: 50 });
  const latest: Record<string, number> = {};
  for (const m of metrics) if (!(m.metric in latest)) latest[m.metric] = m.value;
  const cpuBad = Math.max(0, Math.min(1, ((latest['cpu'] || 0) - 70) / 30));
  const memBad = Math.max(0, Math.min(1, ((latest['memory_percent'] || 0) - 70) / 30));
  const diskBad = Math.max(0, Math.min(1, ((latest['disk'] || 0) - 80) / 20));
  const openIncidents = await db.incident.count({ where: { status: { in: ['open', 'acknowledged'] } } });
  const incBad = Math.min(1, openIncidents / 5);
  const forecasts = await db.forecast.findMany({ where: { host, ts: { gte: new Date() } }, take: 100 });
  const fcValues = forecasts.map((f) => f.value);
  const avgFc = fcValues.length > 0 ? fcValues.reduce((a, b) => a + b, 0) / fcValues.length : 0;
  const fcBad = Math.max(0, Math.min(1, (avgFc - 70) / 30));
  const z = 1.4 * cpuBad + 1.2 * memBad + 0.6 * diskBad + 1.1 * incBad + 0.9 * fcBad - 1.2;
  const probability = 1 / (1 + Math.exp(-z));
  const level = probability > 0.6 ? 'high' : probability > 0.3 ? 'medium' : 'low';
  const factors = { cpu: Math.round(cpuBad * 100) / 100, memory: Math.round(memBad * 100) / 100, disk: Math.round(diskBad * 100) / 100, incidents: Math.round(incBad * 100) / 100, forecast: Math.round(fcBad * 100) / 100 };
  await db.riskScore.create({ data: { host, probability: Math.round(probability * 10000) / 10000, level, factors: JSON.stringify(factors) } });
  return { probability, level, factors };
}