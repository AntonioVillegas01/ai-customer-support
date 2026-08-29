/**
 * Permission-based authorization. Application code checks permissions, never
 * raw role names, so roles can evolve without touching call sites.
 */
export type OrganizationRole = 'owner' | 'admin' | 'agent' | 'analyst';

export type Permission =
  | 'org:manage'
  | 'org:members:manage'
  | 'org:api_keys:manage'
  | 'org:widget:manage'
  | 'org:settings:read'
  | 'knowledge:read'
  | 'knowledge:write'
  | 'conversations:read'
  | 'conversations:respond'
  | 'conversations:assign'
  | 'conversations:manage'
  | 'analytics:read'
  | 'audit:read'
  | 'tools:configure'
  | 'data:export'
  | 'data:delete';

const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  owner: [
    'org:manage',
    'org:members:manage',
    'org:api_keys:manage',
    'org:widget:manage',
    'org:settings:read',
    'knowledge:read',
    'knowledge:write',
    'conversations:read',
    'conversations:respond',
    'conversations:assign',
    'conversations:manage',
    'analytics:read',
    'audit:read',
    'tools:configure',
    'data:export',
    'data:delete',
  ],
  admin: [
    'org:members:manage',
    'org:api_keys:manage',
    'org:widget:manage',
    'org:settings:read',
    'knowledge:read',
    'knowledge:write',
    'conversations:read',
    'conversations:respond',
    'conversations:assign',
    'conversations:manage',
    'analytics:read',
    'audit:read',
    'tools:configure',
    'data:export',
  ],
  agent: [
    'org:settings:read',
    'knowledge:read',
    'conversations:read',
    'conversations:respond',
    'conversations:assign',
  ],
  analyst: ['org:settings:read', 'knowledge:read', 'conversations:read', 'analytics:read'],
};

export function permissionsForRole(role: OrganizationRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: OrganizationRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
