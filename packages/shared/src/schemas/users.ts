import { z } from 'zod';
import type { FamilyStatus } from '../constants';
import { MEMBER_PAGE_SIZE } from '../constants';
import { ROLES, type Role } from '../rbac';
import { passwordSchema } from './auth';
import { objectIdSchema, phoneSchema } from './common';

export const userListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(ROLES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MEMBER_PAGE_SIZE),
});
export type UserListQuery = z.input<typeof userListQuerySchema>;

/**
 * The role and the branch it applies to. For committee members the branch is
 * the one they manage (with everything inside it); for members it is simply
 * their home branch. Admins act everywhere, whatever branch is set.
 */
export const roleUpdateSchema = z.object({
  role: z.enum(ROLES, { error: 'validation.role' }),
  branchId: objectIdSchema,
});
export type RoleUpdateInput = z.input<typeof roleUpdateSchema>;

/*
 * Reset codes are 8 characters from an alphabet without look-alikes
 * (no 0/O, 1/I/L), shown as XXXX-XXXX so they are easy to read over the phone.
 */
export const RESET_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const RESET_CODE_LENGTH = 8;

export const resetCodeSchema = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(z.string().regex(new RegExp(`^[${RESET_CODE_ALPHABET}]{${RESET_CODE_LENGTH}}$`), 'validation.resetCode'));

export function formatResetCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export const resetPasswordSchema = z.object({
  phone: phoneSchema,
  code: resetCodeSchema,
  password: passwordSchema,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'validation.passwordRequired').max(128, 'validation.passwordMax'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  branch: { id: string; name: string; nameMr: string };
  familyId: string;
  familyStatus: FamilyStatus;
  createdAt: string;
}

export interface AdminUserPage {
  items: AdminUser[];
  nextCursor: string | null;
  total: number;
}

export interface RoleChange {
  at: string;
  byName: string;
  fromRole: Role;
  toRole: Role;
  fromBranch: string | null;
  toBranch: string | null;
}

export interface AdminUserDetail extends AdminUser {
  roleHistory: RoleChange[];
  permissions: { canChangeRole: boolean; canResetPassword: boolean };
}

export interface ResetCode {
  code: string;
  expiresAt: string;
}
