import { z } from 'zod';
import { MEMBER_PAGE_SIZE } from '../constants';
import { GOTRA_IDS, type GotraId } from '../gotras';
import { objectIdSchema } from './common';
import type { Relation } from './family';

export const memberListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  branchId: objectIdSchema.optional(),
  gotra: z.enum(GOTRA_IDS).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MEMBER_PAGE_SIZE),
});
export type MemberListQuery = z.input<typeof memberListQuerySchema>;

/** A directory entry. The directory lists people from verified families only. */
export interface Member {
  id: string;
  familyId: string;
  name: string;
  relation: Relation;
  familyHead: string | null;
  gotra: GotraId | null;
  place: string;
  occupation: string | null;
  branch: { id: string; name: string; nameMr: string };
  photoUrl: string | null;
  /** Present only when the viewer may see contact details for this member. */
  phone?: string;
}

export interface MemberPage {
  items: Member[];
  nextCursor: string | null;
  total: number;
}

export const pageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MEMBER_PAGE_SIZE),
});

export const REVIEW_SORTS = ['oldest', 'newest'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

/** The review queue: optionally one branch (inside the viewer's reach), oldest or newest first. */
export const pendingQuerySchema = pageQuerySchema.extend({
  branchId: objectIdSchema.optional(),
  sort: z.enum(REVIEW_SORTS).default('oldest'),
});
export type PendingQuery = z.input<typeof pendingQuerySchema>;
