import { NextResponse } from 'next/server';
import { getPlatformInfo } from '@/lib/collectors/system';
import { getCycleStatus } from '@/lib/orchestrator';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const info = getPlatformInfo();
  return NextResponse.json({
    hostname: info.hostname, platform: info.platform, arch: info.arch, uptime: info.uptime,
    cycleStatus: getCycleStatus(),
    sources: {
      system: existsSync('/proc/stat'), docker: existsSync('/var/run/docker.sock'),
      kubernetes: existsSync('/var/run/secrets/kubernetes.io/serviceaccount/token'),
      logs: existsSync('/var/log/syslog') || existsSync('/var/log/messages'), processes: true,
    },
    timestamp: new Date().toISOString(),
  });
}