import { z } from 'zod';

export const BRANCH_KINDS = ['district', 'city', 'town'] as const;
export type BranchKind = (typeof BRANCH_KINDS)[number];

export const branchSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameMr: z.string(),
  kind: z.enum(BRANCH_KINDS),
  parentId: z.string().nullable(),
});
export type Branch = z.infer<typeof branchSchema>;
