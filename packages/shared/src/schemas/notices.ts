import { z } from 'zod';
import { objectIdSchema } from './common';

/*
 * Notices: committee posts to a branch. Families in that branch and every
 * town under it see them, so a district notice reaches the whole district.
 */

// The kinds live with the other constants, so screens that only need the list
// don't pull zod and these schemas into the first download.
import { NOTICE_KINDS, type NoticeKind } from '../constants';

export const MAX_PINNED_NOTICES = 5;

export const noticeInputSchema = z.object({
  title: z.string().trim().min(3, 'validation.noticeTitle').max(120, 'validation.tooLong'),
  body: z.string().trim().min(1, 'validation.noticeBody').max(3000, 'validation.tooLong'),
  kind: z.enum(NOTICE_KINDS, { error: 'validation.choose' }),
  branchId: objectIdSchema,
  pinned: z.boolean().default(false),
});
export type NoticeInput = z.input<typeof noticeInputSchema>;

export const noticeListQuerySchema = z.object({
  kind: z.enum(NOTICE_KINDS).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface Notice {
  id: string;
  title: string;
  body: string;
  kind: NoticeKind;
  pinned: boolean;
  branch: { id: string; name: string; nameMr: string };
  authorName: string;
  publishedAt: string;
  /** Set once the notice has been edited after publishing. */
  editedAt: string | null;
  permissions: { canEdit: boolean };
}

export interface NoticeFeed {
  /** Pinned notices, always on top of the first page. */
  pinned: Notice[];
  items: Notice[];
  nextCursor: string | null;
}
