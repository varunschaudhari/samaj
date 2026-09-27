import { BRANCH_SCOPED_ROLES, type PendingMember, can } from '@samaj/shared';
import { Types } from 'mongoose';
import { InviteModel } from '../models/invite.model';
import { MemberModel } from '../models/member.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { storage } from '../utils/storage';
import { canReviewFamily } from './access';
import { inBranch } from './audience';
import { loadFamily, recordHistory } from './family.service';
import { familySummaries } from './links.service';
import { closeForRemovedMember } from './matrimony.service';
import type { Viewer } from './viewer';

/*
 * People a family added after it was verified. They stay out of the
 * directory until the branch committee approves them. A committee member
 * doesn't approve additions to their own family; an admin may.
 */

function scope(viewer: Viewer): Record<string, unknown> {
  if (!can(viewer.role, 'member:verify')) throw forbidden('Only the branch committee approves new people.');
  return {
    approval: 'pending',
    ...(BRANCH_SCOPED_ROLES.includes(viewer.role) && { ...inBranch(viewer.branchId), familyId: { $ne: new Types.ObjectId(viewer.familyId) } }),
  };
}

export async function listPendingMembers(viewer: Viewer): Promise<PendingMember[]> {
  const members = await MemberModel.find(scope(viewer)).sort({ createdAt: 1 }).limit(100).lean();
  const families = await familySummaries(viewer, members.map((m) => m.familyId));
  return members.flatMap((m) => {
    const family = families.get(String(m.familyId));
    if (!family) return [];
    return [
      {
        id: String(m._id),
        name: m.name,
        relation: m.relation,
        birthYear: m.birthYear ?? null,
        family,
        addedByName: m.addedByName ?? '',
        addedAt: (m.createdAt ?? new Date()).toISOString(),
      },
    ];
  });
}

export async function countPendingMembers(viewer: Viewer): Promise<number> {
  if (!can(viewer.role, 'member:verify')) return 0;
  return MemberModel.countDocuments(scope(viewer));
}

async function loadPending(viewer: Viewer, memberId: string) {
  if (!Types.ObjectId.isValid(memberId)) throw notFound('That person is no longer waiting.');
  const member = await MemberModel.findById(memberId);
  if (!member || member.approval !== 'pending') throw notFound('That person is no longer waiting.');
  const family = await loadFamily(String(member.familyId));
  if (!canReviewFamily(viewer, family)) throw forbidden('The branch committee approves this, and not for their own family.');
  return { member, family };
}

export async function approveMember(viewer: Viewer, memberId: string): Promise<void> {
  const { member, family } = await loadPending(viewer, memberId);
  member.approval = 'approved';
  member.familyStatus = family.status;
  member.addedByName = null;
  await member.save();
  recordHistory(family, viewer, 'memberApproved', member.name);
  await family.save();
}

/** Not approved: the person comes off the family, with the reason in its history. */
export async function rejectMember(viewer: Viewer, memberId: string, reason: string): Promise<void> {
  const { member, family } = await loadPending(viewer, memberId);
  if (member.userId) throw new AppError(409, 'CONFLICT', 'This person already has an account.');
  if (member.photoKey) await storage.remove(member.photoKey);
  await closeForRemovedMember(member._id);
  await InviteModel.deleteOne({ memberId: member._id });
  await member.deleteOne();
  recordHistory(family, viewer, 'memberRejected', `${member.name}: ${reason}`);
  await family.save();
}
