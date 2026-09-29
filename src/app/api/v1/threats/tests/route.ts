// GET /api/v1/threats/tests — list all available threat evaluation tests
// POST /api/v1/threats/tests — run all tests (or specific test if { testId } in body)

import { NextRequest, NextResponse } from 'next/server';
import { runAllThreatTests, runThreatTest, persistThreat, type ThreatTestResult } from '@/lib/engines/threat-evaluator';
import { categorizeResults } from '@/lib/engines/threat-evaluator';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Return the list of available tests without running them
  const tests = [
    { id: 'ransomware_vssadmin', testName: 'Ransomware: vssadmin delete shadows', category: 'ransomware', mitre: 'T1490', severity: 'critical' },
    { id: 'ransomware_encrypted_files', testName: 'Ransomware: .encrypted/.locked files', category: 'ransomware', mitre: 'T1486', severity: 'critical' },
    { id: 'execution_powershell_encoded', testName: 'Execution: PowerShell -EncodedCommand', category: 'execution', mitre: 'T1059.001', severity: 'high' },
    { id: 'execution_notepad_suspicious', testName: 'Execution: notepad.exe (contained)', category: 'execution', mitre: 'T1059', severity: 'low' },
    { id: 'execution_cmd_suspicious', testName: 'Execution: cmd.exe', category: 'execution', mitre: 'T1059.003', severity: 'low' },
    { id: 'c2_beacon_4444', testName: 'C2: port 4444 (Metasploit)', category: 'c2', mitre: 'T1071', severity: 'critical' },
    { id: 'c2_tor_ports', testName: 'C2: Tor relay ports', category: 'c2', mitre: 'T1071.001', severity: 'high' },
    { id: 'c2_external_connections', testName: 'C2: Unusual external connections', category: 'c2', mitre: 'T1071', severity: 'medium' },
    { id: 'persistence_crontab_modified', testName: 'Persistence: crontab modified', category: 'persistence', mitre: 'T1053.003', severity: 'medium' },
    { id: 'persistence_bashrc_modified', testName: 'Persistence: ~/.bashrc modified', category: 'persistence', mitre: 'T1547.004', severity: 'medium' },
    { id: 'cred_mimikatz', testName: 'Credential Theft: mimikatz/hydra/john', category: 'credential_theft', mitre: 'T1003', severity: 'critical' },
    { id: 'recon_nmap', testName: 'Recon: nmap/masscan', category: 'recon', mitre: 'T1046', severity: 'medium' },
  ];

  return NextResponse.json({
    tests,
    count: tests.length,
    hint: 'POST with {} to run all tests, or { "testId": "ransomware_vssadmin" } to run a single test',
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    let results: ThreatTestResult[];

    if (body.testId) {
      // Run a single test
      const result = runThreatTest(body.testId);
      results = [result];
    } else {
      // Run all tests
      results = runAllThreatTests();
    }

    // Persist any detected threats to DB (deduped by 1-hour window)
    for (const r of results) {
      try { await persistThreat(r); } catch {}
    }

    const categorized = categorizeResults(results);
    const detected = results.filter(r => r.detected);
    const active = results.filter(r => r.status === 'active');
    const contained = results.filter(r => r.status === 'contained');

    return NextResponse.json({
      ok: true,
      total: results.length,
      detected: detected.length,
      active: active.length,
      contained: contained.length,
      clean: results.length - detected.length,
      results,
      summary: categorized,
      ranAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
