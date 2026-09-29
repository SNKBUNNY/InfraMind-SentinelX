// Forecast Engine — 4 models: moving_avg, linear, prophet-like, lstm-like
export type ForecastModel = 'moving_avg' | 'linear' | 'prophet' | 'lstm';
export interface ForecastPoint { ts: string; value: number; lower: number; upper: number; }

function linfit(ys: number[]) {
  const n = ys.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  const xs = ys.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sumXX = xs.reduce((acc, x) => acc + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function stdDev(ys: number[]) {
  if (ys.length < 2) return 0;
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  return Math.sqrt(ys.reduce((acc, y) => acc + (y - mean) ** 2, 0) / ys.length);
}

function forecastMovingAvg(series: any[], horizon: number, stepMs: number): ForecastPoint[] {
  if (series.length === 0) return [];
  const ys = series.map((p) => p.value);
  const { slope } = linfit(ys.slice(-Math.min(20, ys.length)));
  const sigma = stdDev(ys) || 1;
  const lastTs = new Date(series[series.length - 1].ts).getTime();
  const recentAvg = ys.slice(-Math.min(8, ys.length)).reduce((a, b) => a + b, 0) / Math.min(8, ys.length);
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizon; i++) {
    const ts = new Date(lastTs + i * stepMs).toISOString();
    const value = Math.max(0, recentAvg + slope * i);
    const band = sigma * 1.96 * Math.sqrt(i / 4);
    out.push({ ts, value: Math.round(value * 100) / 100, lower: Math.max(0, Math.round((value - band) * 100) / 100), upper: Math.round((value + band) * 100) / 100 });
  }
  return out;
}

function forecastLinear(series: any[], horizon: number, stepMs: number): ForecastPoint[] {
  if (series.length < 2) return forecastMovingAvg(series, horizon, stepMs);
  const ys = series.map((p) => p.value);
  const { slope, intercept } = linfit(ys);
  const sigma = stdDev(ys) || 1;
  const lastTs = new Date(series[series.length - 1].ts).getTime();
  const n = ys.length;
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizon; i++) {
    const ts = new Date(lastTs + i * stepMs).toISOString();
    const value = Math.max(0, intercept + slope * (n + i - 1));
    const band = sigma * 1.96 * Math.sqrt(1 + 1 / n + ((n + i - 1 - (n - 1) / 2) ** 2) / n);
    out.push({ ts, value: Math.round(value * 100) / 100, lower: Math.max(0, Math.round((value - band) * 100) / 100), upper: Math.round((value + band) * 100) / 100 });
  }
  return out;
}

function forecastProphet(series: any[], horizon: number, stepMs: number): ForecastPoint[] {
  if (series.length < 24) return forecastMovingAvg(series, horizon, stepMs);
  const ys = series.map((p) => p.value);
  const { slope, intercept } = linfit(ys);
  const trend = ys.map((_, i) => intercept + slope * i);
  const residual = ys.map((y, i) => y - trend[i]);
  const dailyBuckets = new Array(48).fill(0);
  const dailyCounts = new Array(48).fill(0);
  for (let i = 0; i < residual.length; i++) { const b = i % 48; dailyBuckets[b] += residual[i]; dailyCounts[b]++; }
  for (let i = 0; i < 48; i++) if (dailyCounts[i] > 0) dailyBuckets[i] /= dailyCounts[i];
  const sigma = stdDev(residual) || 1;
  const lastTs = new Date(series[series.length - 1].ts).getTime();
  const n = ys.length;
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizon; i++) {
    const ts = new Date(lastTs + i * stepMs).toISOString();
    const idx = n + i - 1;
    const t = intercept + slope * idx;
    const daily = dailyBuckets[idx % 48];
    const value = Math.max(0, t + daily);
    const band = sigma * 1.96 * Math.sqrt(i / 8);
    out.push({ ts, value: Math.round(value * 100) / 100, lower: Math.max(0, Math.round((value - band) * 100) / 100), upper: Math.round((value + band) * 100) / 100 });
  }
  return out;
}

function forecastLstm(series: any[], horizon: number, stepMs: number): ForecastPoint[] {
  if (series.length < 8) return forecastMovingAvg(series, horizon, stepMs);
  const ys = series.map((p) => p.value);
  let h = ys[0]; let d = 0;
  for (let i = 1; i < ys.length; i++) { d = 0.2 * (ys[i] - ys[i - 1]) + 0.8 * d; h = 0.3 * ys[i] + 0.7 * h; }
  const sigma = stdDev(ys.slice(-Math.min(20, ys.length))) || 1;
  const lastTs = new Date(series[series.length - 1].ts).getTime();
  const out: ForecastPoint[] = [];
  for (let i = 1; i <= horizon; i++) {
    const ts = new Date(lastTs + i * stepMs).toISOString();
    const decay = Math.pow(0.92, i);
    const value = Math.max(0, h + d * i * decay);
    const band = sigma * 1.96 * Math.sqrt(i / 6);
    out.push({ ts, value: Math.round(value * 100) / 100, lower: Math.max(0, Math.round((value - band) * 100) / 100), upper: Math.round((value + band) * 100) / 100 });
  }
  return out;
}

export function forecast(series: any[], horizon: number, stepMs: number, model: ForecastModel = 'prophet'): ForecastPoint[] {
  switch (model) {
    case 'moving_avg': return forecastMovingAvg(series, horizon, stepMs);
    case 'linear': return forecastLinear(series, horizon, stepMs);
    case 'prophet': return forecastProphet(series, horizon, stepMs);
    case 'lstm': return forecastLstm(series, horizon, stepMs);
  }
}

export function autoSelectModel(metric: string): ForecastModel {
  return metric === 'memory' || metric === 'memory_percent' ? 'lstm' : 'prophet';
}

export const HORIZONS = [
  { name: '6h', points: 72, stepMs: 5 * 60 * 1000 },
  { name: '24h', points: 96, stepMs: 15 * 60 * 1000 },
  { name: '7d', points: 168, stepMs: 60 * 60 * 1000 },
  { name: '30d', points: 180, stepMs: 4 * 60 * 60 * 1000 },
];

export function parseHorizon(horizon: string) {
  const m = horizon.match(/^(\d+)([mhd])$/);
  if (!m) return { points: 72, stepMs: 5 * 60 * 1000 };
  const num = Number(m[1]);
  switch (m[2]) {
    case 'm': return { points: num, stepMs: 1 * 60 * 1000 };
    case 'h': return { points: num * 4, stepMs: 15 * 60 * 1000 };
    case 'd': return { points: num * 24, stepMs: 60 * 60 * 1000 };
  }
  return { points: 72, stepMs: 5 * 60 * 1000 };
}