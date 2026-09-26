import { z } from 'zod';
import { MEMBER_PAGE_SIZE } from '../constants';
import { objectIdSchema } from './common';

export const memberListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  branchId: objectIdSchema.optional(),
  gotra: z.string().trim().max(40).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(MEMBER_PAGE_SIZE),
});
export type MemberListQuery = z.input<typeof memberListQuerySchema>;

export const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  familyHead: z.string().nullable(),
  gotra: z.string().nullable(),
  place: z.string(),
  occupation: z.string().nullable(),
  branch: z.object({ id: z.string(), name: z.string(), nameMr: z.string() }),
  verified: z.boolean(),
  /** Present only when the viewer may see contact details for this member. */
  phone: z.string().optional(),
});
export type Member = z.infer<typeof memberSchema>;

export interface MemberPage {
  items: Member[];
  nextCursor: string | null;
  total: number;
}

export interface GotraList {
  items: string[];
}
