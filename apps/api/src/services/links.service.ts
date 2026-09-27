import {
  CHILD_RELATIONS,
  type FamilyDetail,
  type FamilyLinkView,
  type FamilyRequests,
  INVERSE_LINK,
  type LinkKind,
  type LinkedFamily,
  MAX_FAMILY_LINKS,
  type Relation,
  type linkRequestSchema,
  type samePersonSchema,
} from '@samaj/shared';
import { type HydratedDocument, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type FamilyLinkDoc, FamilyLinkModel, linkPair } from '../models/family-link.model';
import { type FamilyDoc, FamilyModel } from '../models/family.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { MemberMoveModel } from '../models/member-move.model';
import { SamePersonModel, personPair } from '../models/same-person.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { canEditFamily, canViewFamily } from './access';
import { getFamily, loadEditable, loadFamily, loadMemberOf, recordHistory } from './family.service';
import { moveViews } from './moves.service';
import type { Viewer } from './viewer';

type LinkInput = z.output<typeof linkRequestSchema>;
type FamilyDocument = HydratedDocument<FamilyDoc>;

const DAY = 24 * 60 * 60 * 1000;

/** Head, place and branch of each family, and whether the viewer may open it. */
export async function familySummaries(viewer: Viewer, ids: (Types.ObjectId | string)[]): Promise<Map<string, LinkedFamily>> {
  const unique = [...new Set(ids.map(String))].map((id) => new Types.ObjectId(id));
  if (unique.length === 0) return new Map();
  const families = await FamilyModel.find({ _id: { $in: unique } }, { history: 0 }).lean();
  const [heads, branches] = await Promise.all([
    MemberModel.find({ familyId: { $in: unique }, isHead: true }, { familyId: 1, name: 1 }).lean(),
    BranchModel.find({ _id: { $in: families.map((f) => f.branchId) } }).lean(),
  ]);
  const headBy = new Map(heads.map((h) => [String(h.familyId), h.name]));
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  return new Map(
    families.map((f) => {
      const b = branchBy.get(String(f.branchId));
      return [
        String(f._id),
        {
          id: String(f._id),
          headName: headBy.get(String(f._id)) ?? '',
          place: f.place,
          branch: { id: String(f.branchId), name: b?.name ?? '', nameMr: b?.nameMr ?? '' },
          canView: canViewFamily(viewer, f),
        },
      ];
    }),
  );
}

/** Moves read per family page; older ones drop off. */
const MOVES_SHOWN = 20;

export interface MovedOut {
  fromFamilyId: string;
  /** Their relation in the family they left; null for moves recorded before it was kept. */
  relation: Relation | null;
  at: Date;
  member: MemberDoc & { _id: Types.ObjectId };
  /** The family they are in now. */
  family: LinkedFamily;
}

/**
 * People who moved out of these families, and the family each is in now.
 * The latest move per person; people who have since come back are left out.
 * Callers decide who may see them (listed, and the family they moved to).
 */
export async function movesOutOf(viewer: Viewer, familyIds: string[]): Promise<MovedOut[]> {
  if (familyIds.length === 0) return [];
  const moves = await MemberMoveModel.find({ fromFamilyId: { $in: familyIds.map((id) => new Types.ObjectId(id)) }, status: 'done' })
    .sort({ decidedAt: -1 })
    .limit(MOVES_SHOWN * familyIds.length)
    .lean();
  const seen = new Set<string>();
  const latest = moves.filter((m) => {
    const key = `${String(m.fromFamilyId)}:${String(m.memberId)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (latest.length === 0) return [];
  const members = await MemberModel.find({ _id: { $in: latest.map((m) => m.memberId) } }).lean();
  const memberBy = new Map(members.map((m) => [String(m._id), m]));
  const summaries = await familySummaries(viewer, members.map((m) => m.familyId));
  return latest.flatMap((move) => {
    const member = memberBy.get(String(move.memberId));
    if (!member || String(member.familyId) === String(move.fromFamilyId)) return [];
    const family = summaries.get(String(member.familyId));
    if (!family) return [];
    return [{ fromFamilyId: String(move.fromFamilyId), relation: move.fromRelation ?? null, at: move.decidedAt ?? move.updatedAt, member, family }];
  });
}

/** For people in this family who moved in: the family each came from (their माहेर). */
export async function movedInFrom(viewer: Viewer, familyId: Types.ObjectId, memberIds: Types.ObjectId[]): Promise<Map<string, LinkedFamily>> {
  if (memberIds.length === 0) return new Map();
  const moves = await MemberMoveModel.find({ memberId: { $in: memberIds }, toFamilyId: familyId, status: 'done' }, { memberId: 1, fromFamilyId: 1 })
    .sort({ decidedAt: -1 })
    .lean();
  if (moves.length === 0) return new Map();
  const summaries = await familySummaries(viewer, moves.map((m) => m.fromFamilyId));
  const from = new Map<string, LinkedFamily>();
  for (const move of moves) {
    const family = summaries.get(String(move.fromFamilyId));
    if (family && !from.has(String(move.memberId))) from.set(String(move.memberId), family);
  }
  return from;
}

const isFrom = (link: Pick<FamilyLinkDoc, 'fromFamilyId'>, familyId: string) => String(link.fromFamilyId) === familyId;
/** What the other family is to this one. */
const kindFor = (link: Pick<FamilyLinkDoc, 'fromFamilyId' | 'kind'>, familyId: string): LinkKind =>
  isFrom(link, familyId) ? link.kind : INVERSE_LINK[link.kind];
const otherOf = (link: Pick<FamilyLinkDoc, 'fromFamilyId' | 'toFamilyId'>, familyId: string) =>
  isFrom(link, familyId) ? link.toFamilyId : link.fromFamilyId;

/**
 * The viewer's own (verified) family may propose links to, and ask for people
 * from, this family. Families act for themselves, not through the committee.
 */
export function actsForOwnFamily(viewer: Viewer, family: Pick<FamilyDoc, 'status'> & { _id: Types.ObjectId }): boolean {
  return viewer.familyStatus === 'verified' && String(family._id) !== viewer.familyId && family.status === 'verified' && canViewFamily(viewer, family as FamilyDocument);
}

/** The families linked (accepted) to the viewer's own. */
export async function linkedToViewer(viewer: Viewer): Promise<Set<string>> {
  if (!Types.ObjectId.isValid(viewer.familyId)) return new Set();
  const own = new Types.ObjectId(viewer.familyId);
  const links = await FamilyLinkModel.find({ status: 'accepted', $or: [{ fromFamilyId: own }, { toFamilyId: own }] }, { fromFamilyId: 1, toFamilyId: 1 }).lean();
  return new Set(links.map((l) => String(String(l.fromFamilyId) === viewer.familyId ? l.toFamilyId : l.fromFamilyId)));
}

/** Accepted links on a family page. The family itself sees all of them; others see the families they may open. */
export async function linksOf(viewer: Viewer, family: FamilyDocument): Promise<FamilyLinkView[]> {
  const id = String(family._id);
  const links = await FamilyLinkModel.find({ status: 'accepted', $or: [{ fromFamilyId: family._id }, { toFamilyId: family._id }] }).lean();
  if (links.length === 0) return [];
  const summaries = await familySummaries(viewer, links.map((l) => otherOf(l, id)));
  const canEdit = canEditFamily(viewer, family);
  return links.flatMap((l) => {
    const other = summaries.get(String(otherOf(l, id)));
    if (!other || (!other.canView && !canEdit)) return [];
    return [{ id: String(l._id), kind: kindFor(l, id), family: other, canRemove: canEdit }];
  });
}

/** Everything waiting for this family, for the family and its committee. */
export async function requestsFor(viewer: Viewer, familyId: string): Promise<FamilyRequests> {
  const family = await loadEditable(viewer, familyId);
  const recent = new Date(Date.now() - 30 * DAY);
  const [incoming, outgoing, movesOut, movesIn] = await Promise.all([
    FamilyLinkModel.find({ toFamilyId: family._id, status: 'pending' }).sort({ createdAt: -1 }).lean(),
    FamilyLinkModel.find({ fromFamilyId: family._id, status: 'pending' }).sort({ createdAt: -1 }).lean(),
    MemberMoveModel.find({ fromFamilyId: family._id, status: 'awaitingFamily' }).sort({ createdAt: -1 }).lean(),
    // Moves in, including recent refusals, so the family sees how it ended.
    MemberMoveModel.find({
      toFamilyId: family._id,
      $or: [{ status: { $in: ['awaitingFamily', 'awaitingCommittee'] } }, { status: 'declined', updatedAt: { $gte: recent } }],
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  const summaries = await familySummaries(viewer, [...incoming.map((l) => l.fromFamilyId), ...outgoing.map((l) => l.toFamilyId)]);
  const [out, into] = await Promise.all([moveViews(viewer, movesOut), moveViews(viewer, movesIn)]);
  const pick = (id: Types.ObjectId) => summaries.get(String(id));
  return {
    incomingLinks: incoming.flatMap((l) => {
      const f = pick(l.fromFamilyId);
      return f ? [{ id: String(l._id), kind: kindFor(l, familyId), family: f, requestedByName: l.requestedByName, createdAt: l.createdAt.toISOString() }] : [];
    }),
    outgoingLinks: outgoing.flatMap((l) => {
      const f = pick(l.toFamilyId);
      return f ? [{ id: String(l._id), kind: l.kind, family: f, createdAt: l.createdAt.toISOString() }] : [];
    }),
    movesOut: out,
    movesIn: into,
  };
}

const linkIssue = (message: string, path = 'toFamilyId') => [{ path, message }];

/** The viewer's family proposes a link: "this family is our ___". */
export async function requestLink(viewer: Viewer, input: LinkInput): Promise<FamilyRequests> {
  const own = await loadFamily(viewer.familyId);
  if (own.status !== 'verified') {
    throw new AppError(409, 'CONFLICT', 'Your family needs to be verified first.', linkIssue('validation.familyNotVerified'));
  }
  if (input.toFamilyId === viewer.familyId) throw new AppError(400, 'VALIDATION_FAILED', 'Pick another family.', linkIssue('validation.linkSelf'));
  const other = await loadFamily(input.toFamilyId);
  if (!canViewFamily(viewer, other) || other.status !== 'verified') throw notFound('That family is no longer in the directory.');

  const counts = await Promise.all(
    [own._id, other._id].map((id) => FamilyLinkModel.countDocuments({ $or: [{ fromFamilyId: id }, { toFamilyId: id }] })),
  );
  if (counts.some((n) => n >= MAX_FAMILY_LINKS)) {
    throw new AppError(409, 'CONFLICT', `A family can have up to ${MAX_FAMILY_LINKS} links.`, linkIssue('validation.linkLimit'));
  }
  try {
    await FamilyLinkModel.create({
      fromFamilyId: own._id,
      toFamilyId: other._id,
      kind: input.kind,
      pair: linkPair(own._id, other._id),
      requestedByUserId: new Types.ObjectId(viewer.id),
      requestedByName: viewer.name,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'CONFLICT', 'These families are already linked, or a request is waiting.', linkIssue('validation.linkExists'));
    }
    throw err;
  }
  return requestsFor(viewer, viewer.familyId);
}

async function loadLink(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('That request is no longer there.');
  const link = await FamilyLinkModel.findById(id);
  if (!link) throw notFound('That request is no longer there.');
  return link;
}

export async function headName(familyId: Types.ObjectId) {
  return (await MemberModel.findOne({ familyId, isHead: true }, { name: 1 }).lean())?.name ?? '';
}

/** The other family (or its committee) accepts. */
export async function acceptLink(viewer: Viewer, id: string): Promise<FamilyRequests> {
  const link = await loadLink(id);
  const to = await loadFamily(String(link.toFamilyId));
  if (!canEditFamily(viewer, to)) throw forbidden('Only the family asked can accept this.');
  if (link.status !== 'pending') throw new AppError(409, 'CONFLICT', 'This link was already accepted.');
  const from = await loadFamily(String(link.fromFamilyId));

  link.status = 'accepted';
  link.acceptedByName = viewer.name;
  link.acceptedAt = new Date();
  await link.save();
  recordHistory(from, viewer, 'linked', `Family of ${await headName(to._id)}`);
  recordHistory(to, viewer, 'linked', `Family of ${await headName(from._id)}`);
  await Promise.all([from.save(), to.save()]);
  return requestsFor(viewer, String(to._id));
}

/** Decline (the family asked), cancel (the family asking) or remove (either side, once accepted). */
export async function removeLink(viewer: Viewer, id: string): Promise<void> {
  const link = await loadLink(id);
  const [from, to] = await Promise.all([loadFamily(String(link.fromFamilyId)), loadFamily(String(link.toFamilyId))]);
  if (!canEditFamily(viewer, from) && !canEditFamily(viewer, to)) throw forbidden('Only the two families can remove this link.');
  await link.deleteOne();
  if (link.status === 'accepted') {
    recordHistory(from, viewer, 'unlinked', `Family of ${await headName(to._id)}`);
    recordHistory(to, viewer, 'unlinked', `Family of ${await headName(from._id)}`);
    await Promise.all([from.save(), to.save()]);
  }
}

const tieIssue = (message: string) => [{ path: 'memberId', message }];

/**
 * Someone's parent is listed in another family: a head whose father still
 * heads the family home, a wife whose father is in her माहेर. The two
 * families must already be linked, so both have agreed to know each other.
 */
export async function setExternalParent(viewer: Viewer, familyId: string, memberId: string, parentId: string | null): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);
  if (parentId === null) {
    member.externalParentId = null;
  } else {
    if (CHILD_RELATIONS.includes(member.relation)) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Their parents are in this family.', tieIssue('validation.parentInFamily'));
    }
    const parent = Types.ObjectId.isValid(parentId) ? await MemberModel.findById(parentId) : null;
    const theirs = parent ? await FamilyModel.findById(parent.familyId, { history: 0 }).lean() : null;
    if (!parent || !theirs || !canViewFamily(viewer, theirs)) throw notFound('That person is no longer in the directory.');
    if (String(parent.familyId) === String(family._id)) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Pick someone from the other family.', tieIssue('validation.parentOtherFamily'));
    }
    const linked = await FamilyLinkModel.exists({ pair: linkPair(family._id, parent.familyId), status: 'accepted' });
    if (!linked) throw new AppError(409, 'CONFLICT', 'Link the two families first.', tieIssue('validation.parentNotLinked'));
    member.externalParentId = parent._id;
    recordHistory(family, viewer, 'updated', `${member.name}'s parent: ${parent.name}, in the family of ${await headName(parent.familyId)}`);
  }
  await member.save();
  if (parentId === null) recordHistory(family, viewer, 'updated', `${member.name}'s parent in another family removed`);
  await family.save();
  return getFamily(viewer, familyId);
}

type SamePersonInput = z.output<typeof samePersonSchema>;

/**
 * A family says two entries in the tree are one person (or not). Either
 * person's family may say so; both must be families the viewer can see.
 */
export async function markSamePerson(viewer: Viewer, input: SamePersonInput): Promise<void> {
  const people = await MemberModel.find({ _id: { $in: [input.a, input.b] } }, { familyId: 1, name: 1 }).lean();
  if (people.length !== 2) throw notFound('That person is no longer in the directory.');
  // In full: the history of the family that says so is saved below.
  const families = await FamilyModel.find({ _id: { $in: people.map((p) => p.familyId) } });
  if (families.length !== 2 || !families.every((f) => canViewFamily(viewer, f))) throw notFound('That person is no longer in the directory.');
  const editable = families.find((f) => canEditFamily(viewer, f));
  if (!editable) throw forbidden('Only either person’s family can say this.');
  await SamePersonModel.findOneAndUpdate(
    { pair: personPair(input.a, input.b) },
    { $set: { a: input.a, b: input.b, same: input.same, byUserId: new Types.ObjectId(viewer.id), byName: viewer.name } },
    { upsert: true },
  );
  const [first, second] = people;
  recordHistory(editable, viewer, 'updated', `${first?.name} and ${second?.name}: ${input.same ? 'the same person' : 'not the same person'}`);
  await editable.save();
}

/** Back to the tree's own guess. */
export async function clearSamePerson(viewer: Viewer, a: string, b: string): Promise<void> {
  if (!Types.ObjectId.isValid(a) || !Types.ObjectId.isValid(b)) throw notFound('That person is no longer in the directory.');
  const people = await MemberModel.find({ _id: { $in: [a, b] } }, { familyId: 1 }).lean();
  const families = await FamilyModel.find({ _id: { $in: people.map((p) => p.familyId) } }, { history: 0 }).lean();
  if (!families.some((f) => canEditFamily(viewer, f))) throw forbidden('Only either person’s family can change this.');
  await SamePersonModel.deleteOne({ pair: personPair(a, b) });
}
