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

const branchName = z.string().trim().min(2, 'validation.branchNameMin').max(60, 'validation.tooLong');

/**
 * The tree has two levels: districts at the top, cities and towns inside a
 * district. A district has no parent; a city or town must have one.
 */
export const branchCreateSchema = z
  .object({
    name: branchName,
    nameMr: branchName,
    kind: z.enum(BRANCH_KINDS, { error: 'validation.branchKind' }),
    parentId: z
      .string()
      .nullish()
      .transform((v) => v || null)
      .pipe(z.string().regex(/^[a-f0-9]{24}$/i, 'validation.invalidId').nullable()),
  })
  .superRefine((input, ctx) => {
    if (input.kind === 'district' && input.parentId) {
      ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'validation.districtHasParent' });
    }
    if (input.kind !== 'district' && !input.parentId) {
      ctx.addIssue({ code: 'custom', path: ['parentId'], message: 'validation.branchParentRequired' });
    }
  });
export type BranchCreateInput = z.input<typeof branchCreateSchema>;

export const branchUpdateSchema = z.object({
  name: branchName,
  nameMr: branchName,
});
export type BranchUpdateInput = z.input<typeof branchUpdateSchema>;

/** A branch with the numbers an admin needs before renaming or removing it. */
export interface BranchSummary extends Branch {
  familyCount: number;
  childCount: number;
}
