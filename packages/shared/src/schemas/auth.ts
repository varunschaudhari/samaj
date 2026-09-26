import { z } from 'zod';
import { FAMILY_STATUSES, GENDERS, LANGUAGES } from '../constants';
import { ROLES } from '../rbac';
import { phoneSchema } from './common';

export const passwordSchema = z.string().min(8, 'validation.passwordMin').max(128, 'validation.passwordMax');

export const personNameSchema = z.string().trim().min(2, 'validation.nameMin').max(80, 'validation.nameMax');

export const signupSchema = z.object({
  name: personNameSchema,
  phone: phoneSchema,
  password: passwordSchema,
  branchId: z.string().regex(/^[a-f0-9]{24}$/i, 'validation.branchRequired'),
  gender: z.enum(GENDERS, { error: 'validation.gender' }),
  /** The language picked on the signup screen becomes the account's preference. */
  language: z.enum(LANGUAGES).default('en'),
});
export type SignupInput = z.input<typeof signupSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, 'validation.passwordRequired').max(128, 'validation.passwordMax'),
});
export type LoginInput = z.input<typeof loginSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  role: z.enum(ROLES),
  branchId: z.string(),
  language: z.enum(LANGUAGES),
  familyId: z.string(),
  memberId: z.string(),
  familyStatus: z.enum(FAMILY_STATUSES),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const updatePreferencesSchema = z.object({
  language: z.enum(LANGUAGES),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/** Every message key the shared schemas can produce. The web dictionary must cover all of them. */
export const VALIDATION_KEYS = [
  'validation.invalidId',
  'validation.phone',
  'validation.passwordMin',
  'validation.passwordMax',
  'validation.passwordRequired',
  'validation.nameMin',
  'validation.nameMax',
  'validation.branchRequired',
  'validation.tooLong',
  'validation.birthYear',
  'validation.relation',
  'validation.gender',
  'validation.placeMin',
  'validation.reasonMin',
  'validation.gotra',
  'validation.branchNameMin',
  'validation.branchKind',
  'validation.districtHasParent',
  'validation.branchParentRequired',
  // Produced by the API for branches.
  'validation.branchExists',
  'validation.branchParentInvalid',
  'validation.role',
  'validation.resetCode',
  'validation.currentPasswordWrong',
  // Produced by the API rather than a schema, but translated the same way.
  'validation.phoneTaken',
  'validation.relationHead',
  'validation.photoType',
  'validation.photoSize',
] as const;
export type ValidationKey = (typeof VALIDATION_KEYS)[number];
