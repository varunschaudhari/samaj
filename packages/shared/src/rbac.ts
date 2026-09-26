export const ROLES = ['member', 'committee', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'directory:read',
  'member:read-contact',
  'member:verify',
  'member:write',
  'notice:publish',
  'branch:manage',
  'user:assign-role',
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
  admin: PERMISSIONS,
};

/** Roles whose permissions are limited to their own branch subtree. */
export const BRANCH_SCOPED_ROLES: readonly Role[] = ['committee'];

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
