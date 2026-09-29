// AI Gateway + Tool Registry — controlled execution of AI-requested actions
// AI agents cannot directly execute system commands — they go through this gateway

import { db } from '@/lib/db';
import { recordAuditEvent } from '@/lib/engines/audit-trail';
import { createHash } from 'crypto';
import { evaluateAutonomy } from '@/lib/engines/autonomy-levels';

// Default tool registry — each tool has explicit permissions + constraints
export const DEFAULT_TOOLS = [
  // Endpoint tools
  { name: 'isolate_host', category: 'endpoint', description: 'Isolate a host from the network — blocks all traffic except management channel', permissions: ['endpoint.isolate'], minAutonomyLevel: 3, minThreatScore: 70, requiresApproval: true },
  { name: 'quarantine_file', category: 'endpoint', description: 'Move a file to encrypted quarantine storage', permissions: ['endpoint.quarantine'], minAutonomyLevel: 3, minThreatScore: 60, requiresApproval: true },
  { name: 'terminate_process', category: 'endpoint', description: 'Terminate a running process by PID', permissions: ['endpoint.terminate'], minAutonomyLevel: 4, minThreatScore: 80, requiresApproval: true },
  { name: 'block_ip', category: 'endpoint', description: 'Block an IP address at the firewall', permissions: ['endpoint.block'], minAutonomyLevel: 3, minThreatScore: 50, requiresApproval: true },

  // Infrastructure tools
  { name: 'scale_replicas', category: 'infrastructure', description: 'Scale a deployment to N replicas', permissions: ['infra.scale'], minAutonomyLevel: 2, minThreatScore: 0, requiresApproval: false },
  { name: 'restart_service', category: 'infrastructure', description: 'Restart a system service', permissions: ['infra.restart'], minAutonomyLevel: 3, minThreatScore: 0, requiresApproval: true },
  { name: 'clear_cache', category: 'infrastructure', description: 'Clear system/application caches', permissions: ['infra.cache'], minAutonomyLevel: 2, minThreatScore: 0, requiresApproval: false },

  // Investigation tools (read-only — always allowed)
  { name: 'query_events', category: 'investigation', description: 'Query security events from the database', permissions: ['investigation.read'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },
  { name: 'query_processes', category: 'investigation', description: 'List running processes on a host', permissions: ['investigation.read'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },
  { name: 'query_network', category: 'investigation', description: 'List network connections on a host', permissions: ['investigation.read'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },
  { name: 'collect_evidence', category: 'investigation', description: 'Collect forensic evidence from a host', permissions: ['investigation.evidence'], minAutonomyLevel: 1, minThreatScore: 0, requiresApproval: false },
  { name: 'retrieve_knowledge', category: 'investigation', description: 'Search the RAG knowledge base', permissions: ['investigation.read'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },

  // Backup / Recovery tools
  { name: 'create_backup', category: 'backup', description: 'Create an encrypted backup of a host/path', permissions: ['backup.write'], minAutonomyLevel: 2, minThreatScore: 0, requiresApproval: false },
  { name: 'restore_backup', category: 'recovery', description: 'Restore from a backup', permissions: ['recovery.execute'], minAutonomyLevel: 4, minThreatScore: 0, requiresApproval: true },
  { name: 'verify_backup', category: 'recovery', description: 'Verify backup integrity', permissions: ['backup.read'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },

  // Policy tools
  { name: 'evaluate_policy', category: 'policy', description: 'Evaluate a .psec policy against an event', permissions: ['policy.read'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },
  { name: 'create_incident', category: 'policy', description: 'Create a security incident', permissions: ['incident.write'], minAutonomyLevel: 1, minThreatScore: 30, requiresApproval: false },

  // Notification tools (always allowed)
  { name: 'notify', category: 'notification', description: 'Send a notification via email/Slack/webhook', permissions: ['notify.send'], minAutonomyLevel: 0, minThreatScore: 0, requiresApproval: false },
];

// Ensure default tools are seeded
export async function ensureToolsSeeded(): Promise<void> {
  const existing = await db.tool.count();
  if (existing > 0) return;
  for (const tool of DEFAULT_TOOLS) {
    await db.tool.create({
      data: {
        name: tool.name,
        category: tool.category,
        description: tool.description,
        permissions: JSON.stringify(tool.permissions),
        minAutonomyLevel: tool.minAutonomyLevel,
        minThreatScore: tool.minThreatScore,
        requiresApproval: tool.requiresApproval,
        enabled: true,
      },
    });
  }
}

export interface ToolExecutionRequest {
  toolName: string;
  agentName?: string;
  userId?: string;
  parameters: Record<string, any>;
  threatScore?: number;
  context?: Record<string, any>; // incidentId, threatId, etc.
}

export interface ToolExecutionResult {
  status: 'approved' | 'rejected' | 'pending_approval' | 'executing' | 'completed' | 'failed';
  toolName: string;
  result?: any;
  message: string;
  auditEventId?: string;
  requiresApproval: boolean;
  reason: string;
  autonomyLevel: number;
}

// Execute a tool through the AI Gateway — this is the ONLY way AI agents can take action
export async function executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
  await ensureToolsSeeded();

  // 1. Look up the tool in the registry
  const tool = await db.tool.findUnique({ where: { name: request.toolName } });
  if (!tool) {
    return { status: 'rejected', toolName: request.toolName, message: 'Tool not found in registry', requiresApproval: false, reason: 'Unknown tool', autonomyLevel: 0 };
  }
  if (!tool.enabled) {
    return { status: 'rejected', toolName: request.toolName, message: 'Tool is disabled', requiresApproval: false, reason: 'Tool disabled', autonomyLevel: 0 };
  }

  // 2. Check autonomy level — is this action permitted?
  const threatScore = request.threatScore || 0;
  const autonomy = await evaluateAutonomy(threatScore, request.toolName);

  // 3. Check if approval is required
  const needsApproval = tool.requiresApproval && autonomy.requiresApproval;

  if (needsApproval && !request.parameters._approved) {
    // Record as pending approval
    const audit = await recordAuditEvent({
      actor: request.agentName ? `agent:${request.agentName}` : `user:${request.userId || 'unknown'}`,
      action: request.toolName.toUpperCase(),
      target: request.parameters.target || request.parameters.host || 'unknown',
      reason: `Tool execution requested — requires human approval`,
      threatScore,
      autonomyLevel: autonomy.permittedLevel,
      approved: false,
      result: 'PENDING',
      metadata: { parameters: request.parameters, toolCategory: tool.category },
    });

    // Create a ToolExecution record for approval workflow
    await db.toolExecution.create({
      data: {
        toolName: request.toolName,
        agentName: request.agentName,
        userId: request.userId,
        parameters: JSON.stringify(request.parameters),
        status: 'pending',
        auditEventId: audit.id,
      },
    });

    return {
      status: 'pending_approval',
      toolName: request.toolName,
      message: `Tool "${request.toolName}" requires human approval before execution.`,
      requiresApproval: true,
      reason: `Autonomy level ${autonomy.permittedLevel} requires approval for this action. ${autonomy.reason}`,
      autonomyLevel: autonomy.permittedLevel,
      auditEventId: audit.id,
    };
  }

  // 4. Execute the tool (simulated for safety — in production this would call the actual endpoint agent)
  const startTime = Date.now();
  let result: any;
  let executionStatus: 'completed' | 'failed' = 'completed';
  let errorMessage: string | undefined;

  try {
    result = await simulateToolExecution(request.toolName, request.parameters);
  } catch (e: any) {
    executionStatus = 'failed';
    errorMessage = e.message;
    result = { error: e.message };
  }

  const duration = Date.now() - startTime;

  // 5. Record audit event
  const audit = await recordAuditEvent({
    actor: request.agentName ? `agent:${request.agentName}` : `user:${request.userId || 'unknown'}`,
    action: request.toolName.toUpperCase(),
    target: request.parameters.target || request.parameters.host || 'unknown',
    reason: request.parameters.reason || `Tool executed via AI Gateway`,
    threatScore,
    policyName: request.parameters.policyName,
    autonomyLevel: autonomy.permittedLevel,
    approved: !needsApproval || request.parameters._approved,
    approver: request.parameters._approvedBy,
    result: executionStatus === 'completed' ? 'SUCCESS' : 'FAILURE',
    errorMessage,
    evidenceHash: result?.evidenceHash,
    metadata: { parameters: request.parameters, duration, result },
  });

  // 6. Update tool execution stats
  await db.tool.update({
    where: { name: request.toolName },
    data: { executions: { increment: 1 }, lastExecutedAt: new Date() },
  });

  return {
    status: executionStatus,
    toolName: request.toolName,
    result,
    message: executionStatus === 'completed'
      ? `Tool "${request.toolName}" executed successfully.`
      : `Tool "${request.toolName}" failed: ${errorMessage}`,
    requiresApproval: false,
    reason: `Executed at autonomy level ${autonomy.permittedLevel}`,
    autonomyLevel: autonomy.permittedLevel,
    auditEventId: audit.id,
  };
}

// Simulate tool execution — in production this would call the actual endpoint agent
async function simulateToolExecution(toolName: string, params: Record<string, any>): Promise<any> {
  const target = params.target || params.host || 'unknown';

  switch (toolName) {
    case 'isolate_host':
      return { action: 'isolate', target, message: `Host ${target} isolated — firewall rules applied, network traffic blocked except management channel.`, evidenceHash: generateHash(`isolate-${target}-${Date.now()}`) };
    case 'quarantine_file':
      return { action: 'quarantine', target, message: `File ${target} moved to encrypted quarantine storage.`, quarantinePath: `/storage/quarantine/${Date.now()}_${params.fileName || 'file'}` };
    case 'terminate_process':
      return { action: 'terminate', target, message: `Process PID ${params.pid || target} terminated.`, processTree: 'captured' };
    case 'block_ip':
      return { action: 'block', target, message: `IP ${target} blocked at egress firewall.` };
    case 'scale_replicas':
      return { action: 'scale', target, message: `Scaled ${params.deployment || target} to ${params.replicas || 3} replicas.`, newReplicaCount: params.replicas || 3 };
    case 'restart_service':
      return { action: 'restart', target, message: `Service ${params.service || target} restarted.`, downtime: '2.3s' };
    case 'clear_cache':
      return { action: 'cache_clear', target, message: `Caches cleared. Freed 256 MB.` };
    case 'create_backup':
      return { action: 'backup', target, message: `Encrypted backup created for ${params.sourcePath || target}.`, backupId: `backup-${Date.now()}`, sizeBytes: 50000000, integrityHash: generateHash(`backup-${Date.now()}`) };
    case 'restore_backup':
      return { action: 'restore', target, message: `Restored from backup ${params.backupId}.`, filesRestored: 1250 };
    case 'verify_backup':
      return { action: 'verify', target, message: `Backup integrity verified. SHA-256 hash matches.`, verified: true };
    case 'notify':
      return { action: 'notify', target, message: `Notification sent to SOC team via ${params.channel || 'email'}.` };
    case 'create_incident':
      return { action: 'create_incident', target, message: `Security incident created.`, incidentId: `INC-${Date.now()}` };
    default:
      // Read-only investigation tools
      return { action: toolName, target, message: `Tool executed (read-only).`, data: { queried: true } };
  }
}

function generateHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// Get all registered tools
export async function getTools(): Promise<any[]> {
  await ensureToolsSeeded();
  const tools = await db.tool.findMany({ orderBy: { category: 'asc' } });
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    permissions: JSON.parse(t.permissions || '[]'),
    minAutonomyLevel: t.minAutonomyLevel,
    minThreatScore: t.minThreatScore,
    requiresApproval: t.requiresApproval,
    enabled: t.enabled,
    executions: t.executions,
    lastExecutedAt: t.lastExecutedAt?.toISOString(),
  }));
}

// Get pending tool executions awaiting approval
export async function getPendingApprovals(): Promise<any[]> {
  const pending = await db.toolExecution.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return pending.map((p) => ({
    id: p.id,
    toolName: p.toolName,
    agentName: p.agentName,
    userId: p.userId,
    parameters: JSON.parse(p.parameters || '{}'),
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));
}

// Approve or reject a pending tool execution
export async function approveToolExecution(executionId: string, approved: boolean, approver: string): Promise<any> {
  const execution = await db.toolExecution.findUnique({ where: { id: executionId } });
  if (!execution) throw new Error('Execution not found');

  if (!approved) {
    await db.toolExecution.update({
      where: { id: executionId },
      data: { status: 'rejected', approvedBy: approver, approvedAt: new Date() },
    });
    await recordAuditEvent({
      actor: execution.agentName ? `agent:${execution.agentName}` : `user:${execution.userId}`,
      action: execution.toolName.toUpperCase(),
      target: JSON.parse(execution.parameters || '{}').target || 'unknown',
      reason: 'Tool execution rejected by human operator',
      result: 'FAILURE',
      approver,
      approved: false,
      metadata: { executionId },
    });
    return { status: 'rejected', message: 'Tool execution rejected.' };
  }

  // Approved — execute the tool
  await db.toolExecution.update({
    where: { id: executionId },
    data: { status: 'approved', approvedBy: approver, approvedAt: new Date() },
  });

  const params = JSON.parse(execution.parameters || '{}');
  params._approved = true;
  params._approvedBy = approver;

  const result = await executeTool({
    toolName: execution.toolName,
    agentName: execution.agentName || undefined,
    userId: execution.userId || undefined,
    parameters: params,
  });

  await db.toolExecution.update({
    where: { id: executionId },
    data: {
      status: result.status === 'completed' ? 'completed' : 'failed',
      result: JSON.stringify(result.result || {}),
      errorMessage: result.message,
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });

  return result;
}