// Autonomy Levels Engine — L0 Observe → L5 Fully Autonomous

import { db } from '@/lib/db';

export const AUTONOMY_LEVELS = [
  { level: 0, name: 'Observe Only', description: 'System observes and logs events but takes no action' },
  { level: 1, name: 'Detect + Explain', description: 'System detects threats and explains reasoning but takes no action' },
  { level: 2, name: 'Recommend', description: 'System recommends actions but requires human approval for all execution' },
  { level: 3, name: 'Execute After Approval', description: 'System executes approved actions, requires approval for medium+ risk' },
  { level: 4, name: 'Auto Low-Risk', description: 'System automatically executes low-risk actions, requires approval for high-risk' },
  { level: 5, name: 'Fully Autonomous', description: 'System executes all actions including containment and recovery without human approval' },
];

const DEFAULT_THRESHOLDS = { observe: 0, recommend: 40, approval: 70, auto: 90 };

export async function ensureAutonomyPolicySeeded(): Promise<void> {
  const existing = await db.autonomyPolicy.count();
  if (existing > 0) return;
  await db.autonomyPolicy.create({
    data: {
      name: 'Default SecOps Policy',
      description: 'Default policy: detect + explain, execute low-risk actions after threat score >= 70',
      level: 3,
      threatScoreThresholds: JSON.stringify(DEFAULT_THRESHOLDS),
      enabledActions: JSON.stringify(['notify', 'create_incident', 'query_events', 'retrieve_knowledge', 'collect_evidence']),
      blockedActions: JSON.stringify(['isolate_host', 'terminate_process', 'restore_backup']),
      enabled: true,
    },
  });
}

export interface AutonomyDecision {
  threatScore: number;
  permittedLevel: number;
  recommendedAction: string;
  requiresApproval: boolean;
  canExecute: boolean;
  reason: string;
}

export async function evaluateAutonomy(threatScore: number, action: string): Promise<AutonomyDecision> {
  await ensureAutonomyPolicySeeded();
  const policy = await db.autonomyPolicy.findFirst({ where: { enabled: true }, orderBy: { level: 'desc' } });
  if (!policy) {
    return { threatScore, permittedLevel: 0, recommendedAction: 'observe', requiresApproval: true, canExecute: false, reason: 'No active autonomy policy' };
  }
  const thresholds = JSON.parse(policy.threatScoreThresholds || '{}');
  const enabledActions = JSON.parse(policy.enabledActions || '[]');
  const blockedActions = JSON.parse(policy.blockedActions || '[]');

  let requiredLevel = 0;
  if (threatScore >= (thresholds.auto || 90)) requiredLevel = 5;
  else if (threatScore >= (thresholds.approval || 70)) requiredLevel = 3;
  else if (threatScore >= (thresholds.recommend || 40)) requiredLevel = 2;
  else requiredLevel = 1;

  const isBlocked = blockedActions.includes(action);
  const isEnabled = enabledActions.includes(action);
  const canExecute = (policy.level >= requiredLevel || isEnabled) && !isBlocked;
  const requiresApproval = !canExecute && policy.level < 4;

  let recommendedAction = 'observe';
  if (threatScore >= 90) recommendedAction = 'auto_execute';
  else if (threatScore >= 70) recommendedAction = 'execute_after_approval';
  else if (threatScore >= 40) recommendedAction = 'recommend';
  else recommendedAction = 'observe';

  const reason = `Threat score ${threatScore} requires level ${requiredLevel}. Active policy level is ${policy.level}. Action "${action}" ${isBlocked ? 'is blocked' : isEnabled ? 'is enabled' : 'requires approval'}.`;

  return { threatScore, permittedLevel: policy.level, recommendedAction, requiresApproval, canExecute, reason };
}

export async function getAutonomyPolicy() {
  await ensureAutonomyPolicySeeded();
  const policies = await db.autonomyPolicy.findMany({ orderBy: { level: 'asc' } });
  return policies.map((p) => ({
    id: p.id, name: p.name, description: p.description, level: p.level,
    thresholds: JSON.parse(p.threatScoreThresholds || '{}'),
    enabledActions: JSON.parse(p.enabledActions || '[]'),
    blockedActions: JSON.parse(p.blockedActions || '[]'),
    enabled: p.enabled,
    levelName: AUTONOMY_LEVELS.find((l) => l.level === p.level)?.name || `Level ${p.level}`,
  }));
}