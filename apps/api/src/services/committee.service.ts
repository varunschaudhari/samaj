import { type CommitteeGroup, OFFICE_POSTS, type OfficeBearer, type officeBearerInputSchema } from '@samaj/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { type BranchDoc, BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { type OfficeBearerDoc, OfficeBearerModel } from '../models/office-bearer.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { hasReach } from './access';
import type { Viewer } from './viewer';

type Input = z.output<typeof officeBearerInputSchema>;

/** Branch committees maintain their own list; this uses the same reach as posting notices. */
const canManage = (viewer: Viewer, branch: Pick<BranchDoc, '_id' | 'ancestors'>) =>
  hasReach(viewer, 'notice:publish', { branchId: branch._id, branchAncestors: branch.ancestors });

const rank = (post: OfficeBearerDoc['post']) => OFFICE_POSTS.indexOf(post);

function toBearer(d: OfficeBearerDoc): OfficeBearer {
  return { id: String(d._id), post: d.post, name: d.name, phone: d.phone };
}

/**
 * The committees a viewer should know about: their own branch and every branch
 * above it (their district), plus any branch they manage. Admins see all.
 * District first, then towns.
 */
export async function listCommittees(viewer: Viewer): Promise<CommitteeGroup[]> {
  let branches: BranchDoc[];
  if (viewer.role === 'admin') {
    branches = await BranchModel.find().lean();
  } else {
    const family = await FamilyModel.findById(viewer.familyId, { branchId: 1, branchAncestors: 1 }).lean();
    const ids = family ? [family.branchId, ...family.branchAncestors] : [];
    const or: Record<string, unknown>[] = [{ _id: { $in: ids } }];
    if (viewer.role === 'committee') {
      const scope = new Types.ObjectId(viewer.branchId);
      or.push({ _id: scope }, { ancestors: scope });
    }
    branches = await BranchModel.find({ $or: or }).lean();
  }
  branches.sort((a, b) => a.ancestors.length - b.ancestors.length || a.name.localeCompare(b.name));

  const bearers = await OfficeBearerModel.find({ branchId: { $in: branches.map((b) => b._id) } }).lean();
  return branches.map((b) => ({
    branch: { id: String(b._id), name: b.name, nameMr: b.nameMr, kind: b.kind },
    bearers: bearers
      .filter((o) => String(o.branchId) === String(b._id))
      .sort((x, y) => rank(x.post) - rank(y.post) || x.name.localeCompare(y.name))
      .map(toBearer),
    canEdit: canManage(viewer, b),
  }));
}

async function manageableBranch(viewer: Viewer, branchId: string) {
  const branch = await BranchModel.findById(branchId).lean();
  if (!branch) throw new AppError(400, 'VALIDATION_FAILED', 'Pick a branch from the list.', [{ path: 'branchId', message: 'validation.branchRequired' }]);
  if (!canManage(viewer, branch)) throw forbidden("Only this branch's committee can change its office-bearers.");
  return branch;
}

export async function addBearer(viewer: Viewer, input: Input): Promise<OfficeBearer> {
  const branch = await manageableBranch(viewer, input.branchId);
  const doc = await OfficeBearerModel.create({
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    post: input.post,
    name: input.name,
    phone: input.phone,
    updatedByUserId: new Types.ObjectId(viewer.id),
  });
  return toBearer(doc.toObject());
}

async function loadBearer(viewer: Viewer, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('That office-bearer is no longer listed.');
  const doc = await OfficeBearerModel.findById(id);
  if (!doc) throw notFound('That office-bearer is no longer listed.');
  await manageableBranch(viewer, String(doc.branchId));
  return doc;
}

export async function updateBearer(viewer: Viewer, id: string, input: Input): Promise<OfficeBearer> {
  const doc = await loadBearer(viewer, id);
  const branch = await manageableBranch(viewer, input.branchId);
  Object.assign(doc, {
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    post: input.post,
    name: input.name,
    phone: input.phone,
    updatedByUserId: new Types.ObjectId(viewer.id),
  });
  await doc.save();
  return toBearer(doc.toObject());
}

export async function removeBearer(viewer: Viewer, id: string): Promise<void> {
  const doc = await loadBearer(viewer, id);
  await doc.deleteOne();
}
