// Anomaly Detection Engine — 4 algorithms in pure TypeScript
import { median } from '@/lib/engines/math-utils';

export interface AnomalyCandidate {
  ts: Date; value: number; expected: number; score: number;
  algorithm: string; severity: string; metadata?: Record<string, any>;
}

export function detectZscore(values: { ts: Date; value: number }[]): AnomalyCandidate[] {
  if (values.length < 5) return [];
  const ys = values.map((v) => v.value);
  const med = median(ys);
  const m = median(ys.map((x) => Math.abs(x - med)));
  if (m === 0) return [];
  return values.filter((v) => {
    const score = Math.abs(0.6745 * (v.value - med) / m);
    return score > 3;
  }).map((v) => {
    const score = Math.abs(0.6745 * (v.value - med) / m);
    return { ts: v.ts, value: v.value, expected: med, score: Math.min(1, score / 10), algorithm: 'zscore', severity: score > 6 ? 'critical' : 'warning', metadata: { modifiedZScore: Math.round(score * 100) / 100 } };
  });
}

export function isolationForest(values: { ts: Date; value: number }[]): AnomalyCandidate[] {
  if (values.length < 10) return [];
  const ys = values.map((v) => v.value);
  const min = Math.min(...ys); const max = Math.max(...ys);
  if (min === max) return [];
  const n = ys.length; const expected = 2 * Math.log2(n) - 0.8;
  const candidates: AnomalyCandidate[] = [];
  for (let i = 0; i < n; i++) {
    let totalPath = 0;
    for (let t = 0; t < 50; t++) {
      let lo = min, hi = max, depth = 0;
      while (lo < hi && depth < 20) { const split = lo + Math.random() * (hi - lo); if (ys[i] < split) hi = split; else lo = split; depth++; }
      totalPath += depth;
    }
    const avgPath = totalPath / 50;
    const score = Math.pow(2, -avgPath / expected);
    if (score > 0.6) candidates.push({ ts: values[i].ts, value: ys[i], expected: median(ys), score, algorithm: 'isolation_forest', severity: score > 0.75 ? 'critical' : 'warning' });
  }
  return candidates;
}

export function dbscan(values: { ts: Date; value: number }[]): AnomalyCandidate[] {
  if (values.length < 10) return [];
  const ys = values.map((v) => v.value);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  const sigma = Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length) || 1;
  const eps = 2 * sigma;
  const candidates: AnomalyCandidate[] = [];
  for (let i = 0; i < ys.length; i++) {
    let neighbors = 0;
    for (let j = 0; j < ys.length; j++) if (Math.abs(ys[i] - ys[j]) <= eps) neighbors++;
    if (neighbors < 3) candidates.push({ ts: values[i].ts, value: ys[i], expected: mean, score: Math.min(1, (3 - neighbors) / 3), algorithm: 'dbscan', severity: neighbors === 1 ? 'critical' : 'warning' });
  }
  return candidates;
}

export function detectMemoryLeak(values: { ts: Date; value: number }[]): AnomalyCandidate | null {
  if (values.length < 30) return null;
  const recent = values.slice(-144);
  const ys = recent.map((v) => v.value);
  const { slope, intercept } = linreg(ys);
  const predicted = ys.map((_, i) => intercept + slope * i);
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssRes = ys.reduce((acc, y, i) => acc + (y - predicted[i]) ** 2, 0);
  const ssTot = ys.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const slopeMBPerHour = slope * 12;
  if (slopeMBPerHour > 5 && r2 > 0.6) {
    return { ts: recent[recent.length - 1].ts, value: ys[ys.length - 1], expected: intercept, score: Math.min(1, slopeMBPerHour / 100), algorithm: 'memory_leak', severity: slopeMBPerHour > 30 ? 'critical' : 'warning', metadata: { slopeMBPerHour: Math.round(slopeMBPerHour * 100) / 100, r2: Math.round(r2 * 100) / 100 } };
  }
  return null;
}

function linreg(ys: number[]) {
  const n = ys.length; const xs = ys.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0); const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export function scanSeries(values: { ts: Date; value: number }[], metric: string): AnomalyCandidate[] {
  const candidates = [...isolationForest(values), ...dbscan(values), ...detectZscore(values)];
  if (metric === 'memory' || metric === 'memory_percent') { const leak = detectMemoryLeak(values); if (leak) candidates.push(leak); }
  if (candidates.length === 0) return [];
  return [candidates.sort((a, b) => b.score - a.score)[0]];
}