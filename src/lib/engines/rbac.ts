// RBAC Engine — Role-Based Access Control with tenant isolation

import { db } from '@/lib/db';

export const ROLES = [
  { name: 'super_admin', description: 'Full platform access — all organizations', permissions: ['*'] },
  { name: 'org_admin', description: 'Full access within their organization', permissions: ['threat.read', 'threat.write', 'incident.read', 'incident.write', 'agent.execute', 'policy.read', 'policy.write', 'backup.read', 'backup.write', 'recovery.execute', 'reports.read', 'reports.write', 'audit.read', 'assets.read', 'assets.write', 'settings.read', 'settings.write'] },
  { name: 'security_analyst', description: 'Security monitoring + incident response', permissions: ['threat.read', 'incident.read', 'incident.write', 'agent.execute', 'policy.read', 'backup.read', 'reports.read', 'audit.read', 'assets.read'] },
  { name: 'infra_analyst', description: 'Infrastructure monitoring + remediation', permissions: ['incident.read', 'incident.write', 'agent.execute', 'backup.read', 'reports.read', 'assets.read', 'audit.read'] },
  { name: 'incident_responder', description: 'Active incident response + containment', permissions: ['threat.read', 'incident.read', 'incident.write', 'agent.execute', 'recovery.execute', 'backup.read', 'reports.read', 'audit.read'] },
  { name: 'auditor', description: 'Read-only access to all data for compliance', permissions: ['threat.read', 'incident.read', 'policy.read', 'backup.read', 'reports.read', 'audit.read', 'assets.read'] },
  { name: 'viewer', description: 'Read-only dashboard access', permissions: ['threat.read', 'incident.read', 'reports.read'] },
];

// Ensure default roles + demo org + users are seeded
export async function ensureRBACSeeded(): Promise<void> {
  // Create default organization
  const orgExists = await db.organization.count();
  if (orgExists === 0) {
    await db.organization.create({
      data: {
        name: 'Demo Organization',
        slug: 'demo-org',
        plan: 'enterprise',
        status: 'active',
        settings: JSON.stringify({ rpoMinutes: 15, rtoMinutes: 5 }),
      },
    });
  }

  // Create demo users (one per role)
  const userCount = await db.user.count();
  if (userCount === 0) {
    const org = await db.organization.findFirst();
    if (!org) return;
    const users = [
      { email: 'admin@demo.org', name: 'Org Admin', role: 'org_admin' },
      { email: 'analyst@demo.org', name: 'Security Analyst', role: 'security_analyst' },
      { email: 'responder@demo.org', name: 'Incident Responder', role: 'incident_responder' },
      { email: 'auditor@demo.org', name: 'Auditor', role: 'auditor' },
      { email: 'viewer@demo.org', name: 'Viewer', role: 'viewer' },
    ];
    for (const u of users) {
      const role = ROLES.find((r) => r.name === u.role);
      await db.user.create({
        data: {
          email: u.email,
          name: u.name,
          password: 'demo-password-hashed',
          role: u.role,
          orgId: org.id,
          permissions: JSON.stringify(role?.permissions || []),
          status: 'active',
        },
      });
    }
  }
}

// Check if a user has a specific permission
export function hasPermission(userPermissions: string[], permission: string): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(permission)) return true;
  // Check wildcard (e.g., "threat.*" matches "threat.read")
  const wildcard = permission.split('.')[0] + '.*';
  if (userPermissions.includes(wildcard)) return true;
  return false;
}

// Get current user (simplified — in production this would use session/JWT)
export async function getCurrentUser(userId?: string): Promise<any | null> {
  if (!userId) {
    // Default to org_admin for demo
    await ensureRBACSeeded();
    const user = await db.user.findFirst({ where: { role: 'org_admin' }, include: { organization: true } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      permissions: JSON.parse(user.permissions || '[]'),
      organization: user.organization ? { id: user.organization.id, name: user.organization.name, slug: user.organization.slug } : null,
    };
  }
  const user = await db.user.findUnique({ where: { id: userId }, include: { organization: true } });
  if (!user) return null;
  return {
    id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.orgId,
    permissions: JSON.parse(user.permissions || '[]'),
    organization: user.organization ? { id: user.organization.id, name: user.organization.name, slug: user.organization.slug } : null,
  };
}

// Get all organizations (super_admin only)
export async function getOrganizations() {
  return db.organization.findMany({ orderBy: { name: 'asc' } });
}

// Get all users in an organization
export async function getUsers(orgId?: string) {
  const where: any = {};
  if (orgId) where.orgId = orgId;
  const users = await db.user.findMany({ where, orderBy: { createdAt: 'desc' } });
  return users.map((u) => ({
    id: u.id, email: u.email, name: u.name, role: u.role, orgId: u.orgId,
    status: u.status, lastLoginAt: u.lastLoginAt?.toISOString(), mfaEnabled: u.mfaEnabled,
  }));
}