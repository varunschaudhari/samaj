import { BRANCH_SCOPED_ROLES, type FamilyDetail, type PendingFamilyPage, can, type pageQuerySchema } from '@samaj/shared';
import { type QueryFilter, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type FamilyDoc, FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { AppError, forbidden } from '../utils/app-error';
import { canReviewFamily, canViewFamily, isOwnFamily } from './access';
import { getFamily, loadFamily, recordHistory } from './family.service';
import type { Viewer } from './viewer';

type PageQuery = z.output<typeof pageQuerySchema>;

/** Pending families this viewer may review: their branch subtree, never their own (unless admin). */
function queueFilter(viewer: Viewer): QueryFilter<FamilyDoc> {
  if (!can(viewer.role, 'member:verify')) throw forbidden('Only the branch committee reviews new families.');
  const filter: QueryFilter<FamilyDoc> = { status: 'pending' };
  if (BRANCH_SCOPED_ROLES.includes(viewer.role)) {
    const branchId = new Types.ObjectId(viewer.branchId);
    filter.$or = [{ branchId }, { branchAncestors: branchId }];
    filter._id = { $ne: new Types.ObjectId(viewer.familyId) };
  }
  return filter;
}

function encodeCursor(family: { submittedAt: Date; _id: Types.ObjectId }): string {
  return Buffer.from(JSON.stringify([family.submittedAt.toISOString(), String(family._id)])).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: Types.ObjectId } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && Types.ObjectId.isValid(parsed[1])) {
      const at = new Date(parsed[0]);
      if (!Number.isNaN(at.getTime())) return { at, id: new Types.ObjectId(parsed[1]) };
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'The page link is invalid. Reload the list.');
}

/** Oldest first, so families don't wait longer than they need to. */
export async function listPending(viewer: Viewer, query: PageQuery): Promise<PendingFamilyPage> {
  const base = queueFilter(viewer);
  const page: QueryFilter<FamilyDoc> = { ...base };
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    page.$and = [{ $or: [{ submittedAt: { $gt: after.at } }, { submittedAt: after.at, _id: { $gt: after.id } }] }];
  }

  const [docs, total] = await Promise.all([
    FamilyModel.find(page, { history: 0 }).sort({ submittedAt: 1, _id: 1 }).limit(query.limit + 1).lean(),
    FamilyModel.countDocuments(base),
  ]);
  const hasMore = docs.length > query.limit;
  const families = hasMore ? docs.slice(0, query.limit) : docs;
  const ids = families.map((f) => f._id);

  const [heads, counts, branches] = await Promise.all([
    MemberModel.find({ familyId: { $in: ids }, isHead: true }, { familyId: 1, name: 1 }).lean(),
    MemberModel.aggregate<{ _id: Types.ObjectId; n: number }>([{ $match: { familyId: { $in: ids } } }, { $group: { _id: '$familyId', n: { $sum: 1 } } }]),
    BranchModel.find({ _id: { $in: families.map((f) => f.branchId) } }).lean(),
  ]);
  const headBy = new Map(heads.map((h) => [String(h.familyId), h.name]));
  const countBy = new Map(counts.map((c) => [String(c._id), c.n]));
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));

  const last = families.at(-1);
  return {
    total,
    nextCursor: hasMore && last ? encodeCursor({ submittedAt: last.submittedAt, _id: last._id }) : null,
    items: families.map((f) => {
      const branch = branchBy.get(String(f.branchId));
      return {
        id: String(f._id),
        headName: headBy.get(String(f._id)) ?? '',
        place: f.place,
        branch: { id: String(f.branchId), name: branch?.name ?? '', nameMr: branch?.nameMr ?? '' },
        memberCount: countBy.get(String(f._id)) ?? 0,
        submittedAt: f.submittedAt.toISOString(),
      };
    }),
  };
}

export async function countPending(viewer: Viewer): Promise<number> {
  if (!can(viewer.role, 'member:verify')) return 0;
  return FamilyModel.countDocuments(queueFilter(viewer));
}

async function loadReviewable(viewer: Viewer, familyId: string) {
  const family = await loadFamily(familyId);
  if (!canViewFamily(viewer, family)) throw new AppError(404, 'NOT_FOUND', 'That family is no longer in the directory.');
  if (!canReviewFamily(viewer, family)) {
    throw forbidden(isOwnFamily(viewer, family) ? 'Another committee member needs to review your own family.' : 'Only the branch committee reviews this family.');
  }
  if (family.status !== 'pending') {
    throw new AppError(409, 'CONFLICT', 'This family was already reviewed. Reload to see the latest status.');
  }
  return family;
}

async function setStatus(familyId: Types.ObjectId, status: FamilyDoc['status']) {
  await MemberModel.updateMany({ familyId }, { $set: { familyStatus: status } });
}

export async function verify(viewer: Viewer, familyId: string): Promise<FamilyDetail> {
  const family = await loadReviewable(viewer, familyId);
  family.status = 'verified';
  family.rejectionReason = null;
  family.reviewedAt = new Date();
  family.reviewedByUserId = new Types.ObjectId(viewer.id);
  recordHistory(family, viewer, 'verified');
  await family.save();
  await setStatus(family._id, 'verified');
  return getFamily(viewer, familyId);
}

export async function reject(viewer: Viewer, familyId: string, reason: string): Promise<FamilyDetail> {
  const family = await loadReviewable(viewer, familyId);
  family.status = 'rejected';
  family.rejectionReason = reason;
  family.reviewedAt = new Date();
  family.reviewedByUserId = new Types.ObjectId(viewer.id);
  recordHistory(family, viewer, 'rejected', reason);
  await family.save();
  await setStatus(family._id, 'rejected');
  return getFamily(viewer, familyId);
}

/** A rejected family fixes its details and asks for review again. */
export async function resubmit(viewer: Viewer, familyId: string): Promise<FamilyDetail> {
  const family = await loadFamily(familyId);
  if (!isOwnFamily(viewer, family)) throw forbidden('Only the family itself can ask for another review.');
  if (family.status !== 'rejected') throw new AppError(409, 'CONFLICT', 'This family is not waiting on changes. Reload to see the latest status.');
  family.status = 'pending';
  family.submittedAt = new Date();
  recordHistory(family, viewer, 'resubmitted');
  await family.save();
  await setStatus(family._id, 'pending');
  return getFamily(viewer, familyId);
}
