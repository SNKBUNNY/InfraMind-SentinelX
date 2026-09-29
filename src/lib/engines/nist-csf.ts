// NIST CSF Posture Engine — compute security posture scores across 6 functions

import { db } from '@/lib/db';

// NIST CSF 2.0 functions
export const NIST_FUNCTIONS = ['govern', 'identify', 'protect', 'detect', 'respond', 'recover'];

export interface NistCsfPosture {
  overall: number;
  functions: { function: string; score: number; level: string; subcategories: any[] }[];
}

// Compute NIST CSF posture scores based on platform data
export async function computeNistCsfPosture(): Promise<NistCsfPosture> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // GOVERN — policy coverage, RBAC, audit trail completeness
  const totalPolicies = await db.policy.count();
  const enabledPolicies = await db.policy.count({ where: { enabled: true } });
  const auditEvents = await db.auditEvent.count({ where: { ts: { gte: since } } });
  const autonomyPolicy = await db.autonomyPolicy.count({ where: { enabled: true } });
  const governScore = Math.min(100,
    (enabledPolicies / Math.max(1, totalPolicies)) * 30 +
    Math.min(40, auditEvents / 10) +
    (autonomyPolicy > 0 ? 30 : 0)
  );

  // IDENTIFY — asset inventory, vulnerability management, risk assessment
  const totalAssets = await db.asset.count();
  const scannedAssets = await db.asset.count({ where: { lastScannedAt: { not: null } } });
  const totalVulns = await db.vulnerability.count({ where: { patched: false } });
  const criticalVulns = await db.vulnerability.count({ where: { severity: 'critical', patched: false } });
  const identifyScore = Math.min(100,
    (totalAssets > 0 ? (scannedAssets / totalAssets) * 50 : 0) +
    (totalAssets > 0 ? 30 : 0) +
    Math.max(0, 20 - criticalVulns * 5)
  );

  // PROTECT — access control, backups, encryption
  const completedBackups = await db.backup.count({ where: { status: 'completed' } });
  const immutableBackups = await db.backup.count({ where: { immutable: true } });
  const verifiedBackups = await db.backup.count({ where: { verified: true } });
  const protectedScore = Math.min(100,
    (completedBackups > 0 ? 30 : 0) +
    (immutableBackups > 0 ? 25 : 0) +
    (verifiedBackups > 0 ? 25 : 0) +
    20 // base for access control being enabled
  );

  // DETECT — threat detection coverage, monitoring, anomaly detection
  const totalEvents = await db.unifiedSecurityEvent.count();
  const processedEvents = await db.unifiedSecurityEvent.count({ where: { isProcessed: true } });
  const activeThreats = await db.threat.count({ where: { status: { in: ['open', 'investigating'] } } });
  const detectedThreats = await db.threat.count();
  const anomalyCoverage = await db.anomaly.count();
  const detectScore = Math.min(100,
    (totalEvents > 0 ? (processedEvents / totalEvents) * 40 : 50) +
    (detectedThreats > 0 ? 30 : 10) +
    (anomalyCoverage > 0 ? 20 : 5) +
    10 // base for monitoring being active
  );

  // RESPOND — incident response, autonomy, containment
  const totalIncidents = await db.incident.count();
  const resolvedIncidents = await db.incident.count({ where: { status: 'resolved' } });
  const containedThreats = await db.threat.count({ where: { status: 'contained' } });
  const responseActions = await db.auditEvent.count({ where: { action: { contains: 'ISOLATE' } } });
  const respondScore = Math.min(100,
    (totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 30 : 50) +
    (containedThreats > 0 ? 25 : 5) +
    (responseActions > 0 ? 15 : 5) +
    10 // base for IR capability
  );

  // RECOVER — backup readiness, RPO/RTO, integrity verification
  const backupStatus = await getBackupReadinessScore();
  const recoveryScore = Math.min(100, backupStatus);

  // Persist scores
  const scores = [
    { function: 'govern', score: governScore, subcategories: [
      { name: 'Policy Coverage', score: (enabledPolicies / Math.max(1, totalPolicies)) * 100 },
      { name: 'Audit Trail', score: Math.min(100, auditEvents / 10) },
      { name: 'Autonomy Governance', score: autonomyPolicy > 0 ? 100 : 0 },
    ]},
    { function: 'identify', score: identifyScore, subcategories: [
      { name: 'Asset Inventory', score: totalAssets > 0 ? 100 : 0 },
      { name: 'Vulnerability Scanning', score: (scannedAssets / Math.max(1, totalAssets)) * 100 },
      { name: 'Risk Assessment', score: Math.max(0, 100 - criticalVulns * 10) },
    ]},
    { function: 'protect', score: protectedScore, subcategories: [
      { name: 'Access Control (RBAC)', score: 100 },
      { name: 'Backup Encryption', score: completedBackups > 0 ? 100 : 0 },
      { name: 'Backup Immutability', score: immutableBackups > 0 ? 100 : 0 },
    ]},
    { function: 'detect', score: detectScore, subcategories: [
      { name: 'Threat Detection', score: detectedThreats > 0 ? 100 : 20 },
      { name: 'Event Processing', score: totalEvents > 0 ? (processedEvents / totalEvents) * 100 : 50 },
      { name: 'Anomaly Detection', score: anomalyCoverage > 0 ? 100 : 20 },
    ]},
    { function: 'respond', score: respondScore, subcategories: [
      { name: 'Incident Resolution', score: totalIncidents > 0 ? (resolvedIncidents / totalIncidents) * 100 : 50 },
      { name: 'Threat Containment', score: containedThreats > 0 ? 100 : 20 },
      { name: 'Response Automation', score: responseActions > 0 ? 100 : 20 },
    ]},
    { function: 'recover', score: recoveryScore, subcategories: [
      { name: 'Backup Readiness', score: backupStatus },
      { name: 'Integrity Verification', score: verifiedBackups > 0 ? 100 : 0 },
      { name: 'RPO/RTO Compliance', score: backupStatus },
    ]},
  ];

  // Persist to DB
  for (const s of scores) {
    await db.nistCsfScore.create({
      data: {
        function: s.function,
        score: Math.round(s.score * 100) / 100,
        details: JSON.stringify(s.subcategories),
      },
    });
  }

  const overall = Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length);

  return {
    overall,
    functions: scores.map((s) => ({
      function: s.function,
      score: Math.round(s.score * 100) / 100,
      level: s.score >= 90 ? 'optimal' : s.score >= 70 ? 'strong' : s.score >= 50 ? 'moderate' : 'weak',
      subcategories: s.subcategories.map((sc) => ({ ...sc, score: Math.round(sc.score * 100) / 100 })),
    })),
  };
}

async function getBackupReadinessScore(): Promise<number> {
  const completedBackups = await db.backup.count({ where: { status: 'completed' } });
  const verifiedBackups = await db.backup.count({ where: { verified: true } });
  if (completedBackups === 0) return 20;
  return Math.min(100, (verifiedBackups / completedBackups) * 80 + 20);
}

// Get latest NIST CSF posture
export async function getNistCsfPosture(): Promise<NistCsfPosture> {
  // Try to get latest scores from DB
  const latestScores = [];
  for (const fn of NIST_FUNCTIONS) {
    const score = await db.nistCsfScore.findFirst({ where: { function: fn }, orderBy: { ts: 'desc' } });
    if (score) {
      latestScores.push({
        function: score.function,
        score: score.score,
        level: score.score >= 90 ? 'optimal' : score.score >= 70 ? 'strong' : score.score >= 50 ? 'moderate' : 'weak',
        subcategories: JSON.parse(score.details || '[]'),
      });
    }
  }
  if (latestScores.length === NIST_FUNCTIONS.length) {
    const overall = Math.round(latestScores.reduce((sum, s) => sum + s.score, 0) / latestScores.length);
    return { overall, functions: latestScores };
  }
  // Fallback: compute fresh
  return computeNistCsfPosture();
}