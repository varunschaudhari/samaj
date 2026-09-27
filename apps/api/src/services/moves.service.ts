import { BRANCH_SCOPED_ROLES, MAX_FAMILY_LINKS, type MemberMoveView, PARENT_CHOICES, PARTNER_CHOICES, type Relation, can, type moveRequestSchema } from '@samaj/shared';
import { type HydratedDocument, Types } from 'mongoose';
import type { z } from 'zod';
import { FamilyLinkModel, linkPair } from '../models/family-link.model';
import type { FamilyDoc } from '../models/family.model';
import { InviteModel } from '../models/invite.model';
import { MemberModel } from '../models/member.model';
import { type MemberMoveDoc, MemberMoveModel } from '../models/member-move.model';
import { UserModel } from '../models/user.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { invalidate } from '../utils/cache';
import { canEditFamily, canReviewFamily, canViewFamily } from './access';
import { inBranch } from './audience';
import { MAX_FAMILY_MEMBERS, loadFamily, recordHistory } from './family.service';
import { familySummaries, headName } from './links.service';
import { closeForMarriage } from './matrimony.service';
import type { Viewer } from './viewer';

type MoveInput = z.output<typeof moveRequestSchema>;
type FamilyDocument = HydratedDocument<FamilyDoc>;

const OPEN = ['awaitingFamily', 'awaitingCommittee'] as const;
const moveGone = () => notFound('That request is no longer there.');
const issue = (message: string, path = 'memberId') => [{ path, message }];

/** The person a move names as their parent or partner in the new family, if they still fit. */
async function tieIn(familyId: Types.ObjectId, relation: Relation, parentId: unknown, partnerId: unknown) {
  const [parent, partner] = await Promise.all([
    parentId ? MemberModel.findOne({ _id: parentId, familyId }, { relation: 1, name: 1 }).lean() : null,
    partnerId ? MemberModel.findOne({ _id: partnerId, familyId }, { relation: 1, name: 1 }).lean() : null,
  ]);
  return {
    parent: parent && PARENT_CHOICES[relation]?.includes(parent.relation) ? parent : null,
    partner: partner && PARTNER_CHOICES[relation]?.includes(partner.relation) ? partner : null,
  };
}

export async function moveViews(viewer: Viewer, moves: MemberMoveDoc[]): Promise<MemberMoveView[]> {
  const summaries = await familySummaries(viewer, moves.flatMap((m) => [m.fromFamilyId, m.toFamilyId]));
  const tieIds = moves.flatMap((m) => [m.parentId, m.partnerId].filter(Boolean));
  const ties = tieIds.length ? await MemberModel.find({ _id: { $in: tieIds } }, { name: 1 }).lean() : [];
  const nameOf = (id: unknown) => (id ? ties.find((t) => String(t._id) === String(id))?.name : undefined);
  return moves.flatMap((m) => {
    const from = summaries.get(String(m.fromFamilyId));
    const to = summaries.get(String(m.toFamilyId));
    if (!from || !to) return [];
    return [
      {
        id: String(m._id),
        member: { id: String(m.memberId), name: m.memberName },
        from,
        to,
        relation: m.relation,
        tie: nameOf(m.partnerId) ? { kind: 'partner', name: nameOf(m.partnerId) ?? '' } : nameOf(m.parentId) ? { kind: 'parent', name: nameOf(m.parentId) ?? '' } : null,
        note: m.note ?? null,
        status: m.status,
        requestedByName: m.requestedByName,
        agreedByName: m.agreedByName ?? null,
        declineReason: m.declineReason ?? null,
        createdAt: m.createdAt.toISOString(),
      },
    ];
  });
}

/**
 * The viewer's family asks for someone listed in another family to move in,
 * usually after a marriage. The old family agrees next, then the committee.
 */
export async function requestMove(viewer: Viewer, input: MoveInput): Promise<MemberMoveView> {
  const to = await loadFamily(viewer.familyId);
  if (to.status !== 'verified') throw new AppError(409, 'CONFLICT', 'Your family needs to be verified first.', issue('validation.familyNotVerified'));

  const member = await MemberModel.findById(input.memberId);
  if (!member) throw notFound('That person is no longer in the directory.');
  if (String(member.familyId) === String(to._id)) throw new AppError(400, 'VALIDATION_FAILED', 'This person is already in your family.', issue('validation.moveSameFamily'));
  const from = await loadFamily(String(member.familyId));
  if (!canViewFamily(viewer, from) || member.approval === 'pending' || member.deceased) throw notFound('That person is no longer in the directory.');
  if (member.isHead) {
    throw new AppError(400, 'VALIDATION_FAILED', 'A family head can’t move. Their family chooses a new head first.', issue('validation.moveHead'));
  }
  // Whose wife or child they will be here: someone in this family whose relation fits.
  const tied = await tieIn(to._id, input.relation, input.parentId, input.partnerId);
  if (input.parentId && !tied.parent) throw new AppError(400, 'VALIDATION_FAILED', 'Pick someone from your family.', issue('validation.tieChoice', 'parentId'));
  if (input.partnerId && !tied.partner) throw new AppError(400, 'VALIDATION_FAILED', 'Pick someone from your family.', issue('validation.tieChoice', 'partnerId'));
  if ((await MemberModel.countDocuments({ familyId: to._id })) >= MAX_FAMILY_MEMBERS) {
    throw new AppError(400, 'VALIDATION_FAILED', `A family can list up to ${MAX_FAMILY_MEMBERS} people.`, issue('validation.familyFull'));
  }

  try {
    const move = await MemberMoveModel.create({
      memberId: member._id,
      memberName: member.name,
      fromRelation: member.relation,
      fromFamilyId: from._id,
      toFamilyId: to._id,
      relation: input.relation,
      parentId: tied.parent?._id ?? null,
      partnerId: tied.partner?._id ?? null,
      note: input.note,
      requestedByUserId: new Types.ObjectId(viewer.id),
      requestedByName: viewer.name,
      branchId: to.branchId,
      branchAncestors: to.branchAncestors,
    });
    const [view] = await moveViews(viewer, [move.toObject()]);
    if (!view) throw moveGone();
    return view;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'CONFLICT', 'A move for this person is already waiting.', issue('validation.moveOpen'));
    }
    throw err;
  }
}

async function loadMove(id: string) {
  if (!Types.ObjectId.isValid(id)) throw moveGone();
  const move = await MemberMoveModel.findById(id);
  if (!move) throw moveGone();
  return move;
}

const view = async (viewer: Viewer, move: MemberMoveDoc) => {
  const [v] = await moveViews(viewer, [move]);
  if (!v) throw moveGone();
  return v;
};

/** The family the person is leaving agrees. */
export async function agreeMove(viewer: Viewer, id: string): Promise<MemberMoveView> {
  const move = await loadMove(id);
  const from = await loadFamily(String(move.fromFamilyId));
  if (!canEditFamily(viewer, from)) throw forbidden('Only the family they are leaving can agree to this.');
  if (move.status !== 'awaitingFamily') throw new AppError(409, 'CONFLICT', 'This request has already moved on. Reload to see where it stands.');
  move.status = 'awaitingCommittee';
  move.agreedByName = viewer.name;
  move.agreedAt = new Date();
  await move.save();
  return view(viewer, move.toObject());
}

/** The new family's branch committee approves, and the person moves. */
export async function approveMove(viewer: Viewer, id: string): Promise<MemberMoveView> {
  const move = await loadMove(id);
  const to = await loadFamily(String(move.toFamilyId));
  if (!canReviewFamily(viewer, to)) throw forbidden('The committee of the new family’s branch approves this, and not for their own family.');
  if (move.status !== 'awaitingCommittee') throw new AppError(409, 'CONFLICT', 'This request isn’t waiting for the committee. Reload to see where it stands.');

  const member = await MemberModel.findById(move.memberId);
  if (!member || String(member.familyId) !== String(move.fromFamilyId)) {
    move.status = 'cancelled';
    await move.save();
    throw new AppError(409, 'CONFLICT', 'This person is no longer in the family they were moving from.');
  }
  if (member.isHead) throw new AppError(409, 'CONFLICT', 'This person has become their family’s head, so they can’t move.', issue('validation.moveHead'));
  const from = await loadFamily(String(move.fromFamilyId));

  member.familyId = to._id;
  member.relation = move.relation;
  member.isHead = false;
  member.branchId = to.branchId;
  member.branchAncestors = to.branchAncestors;
  member.place = to.place;
  member.gotra = to.gotra ?? null;
  member.familyStatus = to.status;
  member.approval = 'approved';
  member.addedByName = null;
  // Ties were to people in the old family; here, whoever the move named, if they still fit.
  const tied = await tieIn(to._id, move.relation, move.parentId, move.partnerId);
  member.parentId = tied.parent?._id ?? null;
  member.partnerId = tied.partner?._id ?? null;
  member.otherParentId = null;
  member.formerPartner = false;
  member.adopted = false;
  // Her name as her parents' family knew it, so she can still be found by it.
  if (!member.maidenName) member.maidenName = member.name;
  await member.save();
  await Promise.all([
    MemberModel.updateMany({ familyId: from._id, parentId: member._id }, { $set: { parentId: null } }),
    MemberModel.updateMany({ familyId: from._id, partnerId: member._id }, { $set: { partnerId: null } }),
    MemberModel.updateMany({ familyId: from._id, otherParentId: member._id }, { $set: { otherParentId: null } }),
  ]);

  await InviteModel.deleteOne({ memberId: member._id });
  await closeForMarriage(member._id);
  if (member.userId) {
    const user = await UserModel.findById(member.userId);
    if (user) {
      user.familyId = to._id;
      // A member's branch is their family's; a committee member keeps the branch they serve.
      if (user.role === 'member') user.branchId = to.branchId;
      await user.save();
    }
  }

  recordHistory(from, viewer, 'movedOut', member.name);
  recordHistory(to, viewer, 'movedIn', member.name);
  await linkAsInLaws(viewer, from, to);
  move.status = 'done';
  move.decidedByName = viewer.name;
  move.decidedAt = new Date();
  await Promise.all([from.save(), to.save(), move.save()]);
  invalidate('dashboard');
  return view(viewer, move.toObject());
}

/**
 * After a marriage the two families are सासर and माहेर to each other: link
 * them as in-laws unless they are linked already. A waiting request between
 * them is accepted, whatever relation it named. Skipped when either family
 * is at its link limit.
 */
async function linkAsInLaws(viewer: Viewer, from: FamilyDocument, to: FamilyDocument): Promise<void> {
  const pair = linkPair(from._id, to._id);
  const existing = await FamilyLinkModel.findOne({ pair });
  if (existing?.status === 'accepted') return;
  if (existing) {
    existing.status = 'accepted';
    existing.acceptedByName = viewer.name;
    existing.acceptedAt = new Date();
    await existing.save();
  } else {
    const counts = await Promise.all([from._id, to._id].map((id) => FamilyLinkModel.countDocuments({ $or: [{ fromFamilyId: id }, { toFamilyId: id }] })));
    if (counts.some((n) => n >= MAX_FAMILY_LINKS)) return;
    try {
      await FamilyLinkModel.create({
        fromFamilyId: from._id,
        toFamilyId: to._id,
        kind: 'inLaws',
        pair,
        status: 'accepted',
        requestedByUserId: new Types.ObjectId(viewer.id),
        requestedByName: viewer.name,
        acceptedByName: viewer.name,
        acceptedAt: new Date(),
      });
    } catch (err) {
      // Linked a moment ago by someone else: nothing more to do.
      if ((err as { code?: number }).code === 11000) return;
      throw err;
    }
  }
  const [fromHead, toHead] = await Promise.all([headName(from._id), headName(to._id)]);
  recordHistory(from, viewer, 'linked', `Family of ${toHead}`);
  recordHistory(to, viewer, 'linked', `Family of ${fromHead}`);
}

/** The old family refuses, or the committee does. */
export async function declineMove(viewer: Viewer, id: string, reason: string | null): Promise<MemberMoveView> {
  const move = await loadMove(id);
  const [from, to] = await Promise.all([loadFamily(String(move.fromFamilyId)), loadFamily(String(move.toFamilyId))]);
  const allowed = (move.status === 'awaitingFamily' && canEditFamily(viewer, from)) || (move.status === 'awaitingCommittee' && canReviewFamily(viewer, to));
  if (!allowed) throw forbidden('You can’t decide on this request now.');
  move.status = 'declined';
  move.declineReason = reason;
  move.decidedByName = viewer.name;
  move.decidedAt = new Date();
  await move.save();
  return view(viewer, move.toObject());
}

/** The family that asked withdraws it. */
export async function cancelMove(viewer: Viewer, id: string): Promise<void> {
  const move = await loadMove(id);
  const to = await loadFamily(String(move.toFamilyId));
  if (!canEditFamily(viewer, to)) throw forbidden('Only the family that asked can withdraw this.');
  if (!(OPEN as readonly string[]).includes(move.status)) throw new AppError(409, 'CONFLICT', 'This request is already settled.');
  move.status = 'cancelled';
  await move.save();
}

/** The committee's queue: moves into families in their branch, never into their own. */
function committeeScope(viewer: Viewer): Record<string, unknown> {
  if (!can(viewer.role, 'member:verify')) throw forbidden('Only the branch committee approves moves.');
  return {
    status: 'awaitingCommittee',
    ...(BRANCH_SCOPED_ROLES.includes(viewer.role) && { ...inBranch(viewer.branchId), toFamilyId: { $ne: new Types.ObjectId(viewer.familyId) } }),
  };
}

export async function listPendingMoves(viewer: Viewer): Promise<MemberMoveView[]> {
  const moves = await MemberMoveModel.find(committeeScope(viewer)).sort({ createdAt: 1 }).limit(100).lean();
  return moveViews(viewer, moves);
}

export async function countPendingMoves(viewer: Viewer): Promise<number> {
  if (!can(viewer.role, 'member:verify')) return 0;
  return MemberMoveModel.countDocuments(committeeScope(viewer));
}
