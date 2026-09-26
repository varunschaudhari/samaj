import type { Branch, BranchSummary, branchCreateSchema, branchUpdateSchema } from '@samaj/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { type BranchDoc, BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { UserModel } from '../models/user.model';
import { AppError, notFound } from '../utils/app-error';
import { cached, invalidate } from '../utils/cache';
import { escapeRegex } from '../utils/regex';

type CreateInput = z.output<typeof branchCreateSchema>;
type UpdateInput = z.output<typeof branchUpdateSchema>;

function toBranch(b: Pick<BranchDoc, '_id' | 'name' | 'nameMr' | 'kind' | 'parentId'>): Branch {
  return { id: String(b._id), name: b.name, nameMr: b.nameMr, kind: b.kind, parentId: b.parentId ? String(b.parentId) : null };
}

const byLevelThenName = (a: Pick<BranchDoc, 'ancestors' | 'name'>, b: Pick<BranchDoc, 'ancestors' | 'name'>) =>
  a.ancestors.length - b.ancestors.length || a.name.localeCompare(b.name);

/** All branches, parents before children, alphabetical within a level. */
export function listBranches(): Promise<Branch[]> {
  // Every signed-in screen asks for this and it rarely changes, so it's cached.
  return cached('branches:all', 60_000, async () => (await BranchModel.find().lean()).sort(byLevelThenName).map(toBranch));
}

/** For the admin screen: every branch with how many families and sub-branches it has. */
export function listBranchSummaries(): Promise<BranchSummary[]> {
  // Counts every family, so a few seconds' staleness is a fair price.
  return cached('branches:summary', 15_000, loadBranchSummaries);
}

async function loadBranchSummaries(): Promise<BranchSummary[]> {
  const [docs, familyCounts, committee] = await Promise.all([
    BranchModel.find().lean(),
    FamilyModel.aggregate<{ _id: Types.ObjectId; n: number }>([{ $group: { _id: '$branchId', n: { $sum: 1 } } }]),
    UserModel.find({ role: 'committee' }, { name: 1, phone: 1, branchId: 1 }).sort({ name: 1 }).lean(),
  ]);
  const families = new Map(familyCounts.map((c) => [String(c._id), c.n]));
  const committeeBy = new Map<string, typeof committee>();
  for (const u of committee) committeeBy.set(String(u.branchId), [...(committeeBy.get(String(u.branchId)) ?? []), u]);
  const children = new Map<string, number>();
  for (const b of docs) if (b.parentId) children.set(String(b.parentId), (children.get(String(b.parentId)) ?? 0) + 1);

  return docs.sort(byLevelThenName).map((b) => ({
    ...toBranch(b),
    familyCount: families.get(String(b._id)) ?? 0,
    childCount: children.get(String(b._id)) ?? 0,
    committee: (committeeBy.get(String(b._id)) ?? []).map((u) => ({ userId: String(u._id), name: u.name, phone: u.phone })),
  }));
}

async function loadBranch(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('That branch no longer exists.');
  const branch = await BranchModel.findById(id);
  if (!branch) throw notFound('That branch no longer exists.');
  return branch;
}

/** Names are unique among siblings, ignoring case, in both languages. */
async function assertUniqueName(parentId: Types.ObjectId | null, name: string, nameMr: string, exceptId?: Types.ObjectId) {
  const same = (value: string) => new RegExp(`^${escapeRegex(value)}$`, 'i');
  const clash = await BranchModel.findOne({
    parentId,
    $or: [{ name: same(name) }, { nameMr: same(nameMr) }],
    ...(exceptId && { _id: { $ne: exceptId } }),
  }).lean();
  if (clash) {
    const path = same(name).test(clash.name) ? 'name' : 'nameMr';
    throw new AppError(409, 'CONFLICT', 'A branch with this name already exists here.', [{ path, message: 'validation.branchExists' }]);
  }
}

export async function createBranch(input: CreateInput): Promise<Branch> {
  let parent: Awaited<ReturnType<typeof loadBranch>> | null = null;
  if (input.parentId) {
    parent = await BranchModel.findById(input.parentId);
    // Two levels only: cities and towns sit directly under a district.
    if (!parent || parent.kind !== 'district') {
      throw new AppError(400, 'VALIDATION_FAILED', 'Cities and towns go inside a district.', [
        { path: 'parentId', message: 'validation.branchParentInvalid' },
      ]);
    }
  }
  await assertUniqueName(parent?._id ?? null, input.name, input.nameMr);

  invalidate('branches');
  const branch = await BranchModel.create({
    name: input.name,
    nameMr: input.nameMr,
    kind: input.kind,
    parentId: parent?._id ?? null,
    ancestors: parent ? [...parent.ancestors, parent._id] : [],
  });
  return toBranch(branch);
}

export async function updateBranch(id: string, input: UpdateInput): Promise<Branch> {
  const branch = await loadBranch(id);
  await assertUniqueName(branch.parentId ?? null, input.name, input.nameMr, branch._id);

  const oldName = branch.name;
  branch.name = input.name;
  branch.nameMr = input.nameMr;
  await branch.save();
  invalidate('branches');

  // A family's place starts as its branch name. Where it still is, follow the rename.
  if (oldName !== input.name) {
    await Promise.all([
      FamilyModel.updateMany({ branchId: branch._id, place: oldName }, { $set: { place: input.name } }),
      MemberModel.updateMany({ branchId: branch._id, place: oldName }, { $set: { place: input.name } }),
    ]);
  }
  return toBranch(branch);
}

/** Only an empty branch can be removed: no sub-branches, families or accounts. */
export async function deleteBranch(id: string): Promise<void> {
  const branch = await loadBranch(id);
  const [children, families, users] = await Promise.all([
    BranchModel.countDocuments({ parentId: branch._id }),
    FamilyModel.countDocuments({ branchId: branch._id }),
    UserModel.countDocuments({ branchId: branch._id }),
  ]);
  if (children > 0) throw new AppError(409, 'CONFLICT', 'Remove or move the cities and towns inside this district first.');
  if (families > 0 || users > 0) throw new AppError(409, 'CONFLICT', "Families belong to this branch, so it can't be removed.");
  await branch.deleteOne();
  invalidate('branches');
}
