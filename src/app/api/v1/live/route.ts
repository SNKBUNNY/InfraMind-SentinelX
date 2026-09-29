import { NextResponse } from 'next/server';
import { collectSystem } from '@/lib/collectors/system';
import { execSync } from 'child_process';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

function getTopProcesses(limit = 8) {
  try {
    const out = execSync('ps -eo pid,comm,pcpu,pmem,rss --sort=-pcpu 2>/dev/null | head -n ' + (limit + 1), { encoding: 'utf8' });
    return out.trim().split('\n').slice(1).map((line) => {
      const parts = line.trim().split(/\s+/);
      return { pid: Number(parts[0]), name: parts[1], cpuPercent: Number(parts[2]), memoryMB: Math.round((Number(parts[4]) || 0) / 1024) };
    });
  } catch { return []; }
}

export async function GET() {
  const system = collectSystem();
  const processes = getTopProcesses(8);
  return NextResponse.json({ ts: system.ts, host: system.host, system, processes, source: 'http-poll' });
}