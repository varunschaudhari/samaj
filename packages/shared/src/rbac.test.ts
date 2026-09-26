import { describe, expect, it } from 'vitest';
import { PERMISSIONS, can } from './rbac';

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

  it('admins have every permission', () => {
    for (const p of PERMISSIONS) expect(can('admin', p)).toBe(true);
  });
});
