/** Lowest to highest. The order matters: see ROLE_RANK. */
export const ROLES = ['member', 'committee', 'admin', 'superadmin'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'directory:read',
  'member:read-contact',
  'member:verify',
  'member:write',
  'notice:publish',
  'branch:manage',
  'user:assign-role',
  /** Appoint or remove admins and super admins. Super admins only. */
  'user:assign-admin',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * What each role can do. Committee permissions apply only inside the committee
 * member's own branch and the branches below it; the API enforces that scope in
 * the service layer, this table only says which actions a role has.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  member: ['directory:read'],
  committee: ['directory:read', 'member:read-contact', 'member:verify', 'member:write', 'notice:publish'],
  admin: PERMISSIONS.filter((p) => p !== 'user:assign-admin'),
  superadmin: PERMISSIONS,
};

/** Roles whose permissions are limited to their own branch subtree. */
export const BRANCH_SCOPED_ROLES: readonly Role[] = ['committee'];

/** Roles that act in every branch. */
export const GLOBAL_ROLES: readonly Role[] = ['admin', 'superadmin'];

/** Roles only a super admin may give or take away. */
export const PROTECTED_ROLES: readonly Role[] = ['admin', 'superadmin'];

export const ROLE_RANK: Record<Role, number> = { member: 0, committee: 1, admin: 2, superadmin: 3 };

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isGlobalRole(role: Role): boolean {
  return GLOBAL_ROLES.includes(role);
}

/** The roles this person may hand out on the People screen. */
export function assignableRoles(role: Role): Role[] {
  if (can(role, 'user:assign-admin')) return [...ROLES];
  if (can(role, 'user:assign-role')) return ROLES.filter((r) => !PROTECTED_ROLES.includes(r));
  return [];
}
