import { z } from 'zod';
import { personNameSchema } from './auth';
import { objectIdSchema, phoneSchema } from './common';

/*
 * Office-bearers: who holds which post in each branch, with a phone number,
 * so families know who to call. Shown to the same audience as notices.
 */

/** In the order they are listed. */
export const OFFICE_POSTS = ['president', 'vicePresident', 'secretary', 'jointSecretary', 'treasurer', 'member'] as const;
export type OfficePost = (typeof OFFICE_POSTS)[number];

export const officeBearerInputSchema = z.object({
  branchId: objectIdSchema,
  post: z.enum(OFFICE_POSTS, { error: 'validation.choose' }),
  name: personNameSchema,
  phone: phoneSchema,
});
export type OfficeBearerInput = z.input<typeof officeBearerInputSchema>;

/**
 * Make someone a committee member for a branch from the Branches screen, and
 * optionally list them on that branch's Committee page under a post.
 */
export const assignCommitteeSchema = z.object({
  userId: objectIdSchema,
  listAs: z
    .string()
    .nullish()
    .transform((v) => v || null)
    .pipe(z.enum(OFFICE_POSTS, { error: 'validation.choose' }).nullable()),
});
export type AssignCommitteeInput = z.input<typeof assignCommitteeSchema>;

export interface OfficeBearer {
  id: string;
  post: OfficePost;
  name: string;
  phone: string;
}

export interface CommitteeGroup {
  branch: { id: string; name: string; nameMr: string; kind: 'district' | 'city' | 'town' };
  bearers: OfficeBearer[];
  canEdit: boolean;
}
