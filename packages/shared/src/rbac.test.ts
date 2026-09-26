import { describe, expect, it } from 'vitest';
import { PERMISSIONS, assignableRoles, can } from './rbac';

describe('rbac', () => {
  it('members can only read the directory', () => {
    expect(can('member', 'directory:read')).toBe(true);
    expect(can('member', 'member:read-contact')).toBe(false);
  });

  it('committee cannot assign roles or manage branches', () => {
    expect(can('committee', 'member:verify')).toBe(true);
    expect(can('committee', 'user:assign-role')).toBe(false);
    expect(can('committee', 'branch:manage')).toBe(false);
  });

  it('super admins have every permission; admins all but appointing admins', () => {
    for (const p of PERMISSIONS) expect(can('superadmin', p)).toBe(true);
    expect(PERMISSIONS.filter((p) => !can('admin', p))).toEqual(['user:assign-admin']);
  });

  it('admins hand out member and committee roles; super admins any', () => {
    expect(assignableRoles('admin')).toEqual(['member', 'committee']);
    expect(assignableRoles('superadmin')).toEqual(['member', 'committee', 'admin', 'superadmin']);
    expect(assignableRoles('committee')).toEqual([]);
  });
});
