import { z } from 'zod';
import { MEMBER_PAGE_SIZE } from '../constants';
import { objectIdSchema } from './common';
import type { Relation } from './family';

export const memberListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  branchId: objectIdSchema.optional(),
  gotra: z.string().trim().max(40).optional(),
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
  gotra: string | null;
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

export interface GotraList {
  items: string[];
}

export const pageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MEMBER_PAGE_SIZE),
});
