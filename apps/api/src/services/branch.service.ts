import type { Branch } from '@samaj/shared';
import { BranchModel } from '../models/branch.model';

/** All branches, parents before children, alphabetical within a level. */
export async function listBranches(): Promise<Branch[]> {
  const docs = await BranchModel.find().lean();
  return docs
    .sort((a, b) => a.ancestors.length - b.ancestors.length || a.name.localeCompare(b.name))
    .map((b) => ({
      id: String(b._id),
      name: b.name,
      nameMr: b.nameMr,
      kind: b.kind,
      parentId: b.parentId ? String(b.parentId) : null,
    }));
}
