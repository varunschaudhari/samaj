import {
  type AudienceFamily,
  type BranchShareRequest,
  type BranchShareView,
  type AudienceGroup,
  DAILY_INVITATION_GUESTS,
  type EarlierGuestList,
  type LinkReplyReceipt,
  MAX_LINK_REPLIES,
  MAX_PEOPLE_PER_FAMILY,
  PATRIKA_MAX_BYTES,
  REMEMBRANCE_KINDS,
  type PatrikaText,
  type PatrikaView,
  type PublicInvitation,
  type UpcomingFunction,
  type GuestVia,
  type InvitationAnswer,
  type InvitationAudience,
  type InvitationDetail,
  type InvitationSummary,
  type LinkKind,
  type LinkedFamily,
  type MyInvitations,
  type addGuestsSchema,
  type approveBranchShareSchema,
  can,
  type declineBranchShareSchema,
  type createInvitationSchema,
  type invitationInputSchema,
  type invitationRsvpSchema,
  type linkReplySchema,
  themeFor,
} from '@samaj/shared';
import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { FamilyModel } from '../models/family.model';
import { type InvitationDoc, InvitationGuestModel, InvitationLinkReplyModel, InvitationModel, InvitationMuteModel } from '../models/invitation.model';
import { BranchModel } from '../models/branch.model';
import { MemberModel } from '../models/member.model';
import { NoticeModel } from '../models/notice.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { storage } from '../utils/storage';
import { canViewFamily, hasReach } from './access';
import { CONTENT_TYPES, imageType, loadFamily } from './family.service';
import { familySummaries, linksOf } from './links.service';
import { getTree } from './tree.service';
import type { Viewer } from './viewer';

type InvitationInput = z.output<typeof invitationInputSchema>;
type CreateInput = z.output<typeof createInvitationSchema>;
type GuestsInput = z.output<typeof addGuestsSchema>;
type RsvpInput = z.output<typeof invitationRsvpSchema>;
type LinkReplyInput = z.output<typeof linkReplySchema>;

const DAY = 86_400_000;
/** "Tomorrow" on Home: functions in the next day and a half. */
const UPCOMING_WINDOW = 36 * 60 * 60 * 1000;
/** Answers close half a day after the last function. */
const CLOSES_AFTER = 12 * 60 * 60 * 1000;
const gone = () => notFound('That invitation is no longer there.');
const issue = (message: string, path = 'guestFamilyIds') => [{ path, message }];

type FunctionDoc = InvitationDoc['functions'][number];
const functionView = (f: FunctionDoc) => ({
  id: f.fid,
  name: f.name,
  startsAt: f.startsAt.toISOString(),
  endsAt: f.endsAt?.toISOString() ?? null,
  venue: f.venue,
  mapUrl: f.mapUrl ?? null,
  muhuratAt: f.muhuratAt?.toISOString() ?? null,
});

/** The names a patrika prints, and the one remembered with their years and photo. */
async function patrikaTextOf(inv: Pick<InvitationDoc, 'honorees' | 'kripa' | 'blessings' | 'inviters' | 'memorialMemberId'>): Promise<PatrikaText> {
  const m = inv.memorialMemberId ? await MemberModel.findById(inv.memorialMemberId, { name: 1, birthYear: 1, deathYear: 1, photoKey: 1, photoVersion: 1 }).lean() : null;
  return {
    honorees: (inv.honorees ?? []).map((h) => ({ name: h.name, detail: h.detail ?? null })),
    kripa: [...(inv.kripa ?? [])],
    blessings: [...(inv.blessings ?? [])],
    inviters: [...(inv.inviters ?? [])],
    memorial: m
      ? { memberId: String(m._id), name: m.name, years: m.birthYear || m.deathYear ? `${m.birthYear ?? '…'} – ${m.deathYear ?? '…'}` : null, photoVersion: m.photoKey ? (m.photoVersion ?? 0) : null }
      : null,
  };
}

/** Only someone from the host's own family can be the one remembered. */
async function memorialOf(host: Types.ObjectId, memberId: string | null) {
  if (!memberId) return null;
  const member = await MemberModel.findOne({ _id: new Types.ObjectId(memberId), familyId: host }, { _id: 1 }).lean();
  if (!member) throw new AppError(400, 'VALIDATION_FAILED', 'That person isn’t in your family.', issue('validation.memorialMember', 'memorialMemberId'));
  return member._id;
}

/** The patrika fields as stored, from the form. */
const patrikaFields = (input: InvitationInput) => ({ honorees: input.honorees, kripa: input.kripa, blessings: input.blessings, inviters: input.inviters, theme: input.theme ? themeFor(input.kind, input.theme) : null });

const patrikaOf = (inv: Pick<InvitationDoc, 'patrikaKey' | 'patrikaVersion'>): PatrikaView | null =>
  inv.patrikaKey ? { kind: inv.patrikaKey.endsWith('.pdf') ? 'pdf' : 'image', version: inv.patrikaVersion ?? 0 } : null;

const isClosed = (inv: Pick<InvitationDoc, 'lastAt' | 'cancelledAt'>) => Boolean(inv.cancelledAt) || inv.lastAt.getTime() + CLOSES_AFTER < Date.now();

/** Only account holders of a verified family send invitations, in that family's name. */
function assertHost(viewer: Viewer) {
  if (viewer.familyStatus !== 'verified') {
    throw new AppError(403, 'FORBIDDEN', 'Your family needs to be verified before it can send invitations.', issue('validation.familyNotVerified', 'invitation'));
  }
}

function toFunctions(input: InvitationInput, previous: readonly { fid: string }[] = []) {
  const known = new Set(previous.map((f) => f.fid));
  const functions = input.functions
    .map((f) => ({
      fid: f.id && known.has(f.id) ? f.id : new Types.ObjectId().toHexString(),
      name: f.name,
      startsAt: new Date(f.startsAt),
      endsAt: f.endsAt ? new Date(f.endsAt) : null,
      venue: f.venue,
      mapUrl: f.mapUrl,
      muhuratAt: f.muhuratAt ? new Date(f.muhuratAt) : null,
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const firstAt = functions[0]?.startsAt ?? new Date();
  const lastAt = new Date(Math.max(...functions.map((f) => (f.endsAt ?? f.startsAt).getTime())));
  return { functions, firstAt, lastAt };
}

/** Families the host may pick from: everyone in their family tree (grouped by how they are related), their linked families, and earlier guest lists. */
export async function audienceFor(viewer: Viewer): Promise<InvitationAudience> {
  assertHost(viewer);
  const own = await loadFamily(viewer.familyId);
  const [tree, links, sentToday, earlier] = await Promise.all([getTree(viewer, viewer.familyId).catch(() => null), linksOf(viewer, own), sentSince(own._id), earlierGuestLists(viewer, own._id)]);
  const seen = new Set([viewer.familyId]);
  const once = <T extends LinkedFamily>(families: T[]) =>
    families.filter((f) => {
      if (!f.canView || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  const people = new Map((tree?.households ?? []).flatMap((h) => h.members.map((m) => [m.id, m] as const)));
  const byKind = (kind: LinkKind | null): AudienceGroup => (kind === 'inLaws' ? 'inLaws' : kind === 'relatives' ? 'relatives' : 'family');
  const grouped = (tree?.households ?? []).map((h): AudienceFamily => {
    // Someone's parents' home: a woman who married in, her माहेर; otherwise the family's own.
    if (h.via === 'person') {
      const through = h.through ? people.get(h.through.id) : undefined;
      return through?.gender === 'female' ? { ...h.family, group: 'maher', through: through.name } : { ...h.family, group: 'family', through: null };
    }
    return { ...h.family, group: byKind(h.via), through: null };
  });
  const side = (tree?.side ?? []).map((s): AudienceFamily => ({ ...s.family, group: byKind(s.kind), through: null }));
  return {
    tree: once([...grouped, ...side]),
    linked: once(links.map((l) => l.family)),
    earlier,
    leftToday: Math.max(0, DAILY_INVITATION_GUESTS - sentToday),
  };
}

/** The family's last few invitations and who was on each, to invite the same families again. */
async function earlierGuestLists(viewer: Viewer, host: Types.ObjectId): Promise<EarlierGuestList[]> {
  const invitations = await InvitationModel.find({ familyId: host }, { kind: 1, forNames: 1, firstAt: 1 }).sort({ firstAt: -1 }).limit(EARLIER_LISTS).lean();
  if (invitations.length === 0) return [];
  const guests = await InvitationGuestModel.find({ invitationId: { $in: invitations.map((i) => i._id) } }, { invitationId: 1, familyId: 1 }).lean();
  const summaries = await familySummaries(viewer, guests.map((g) => g.familyId));
  // The same families sent twice (an invitation cancelled and sent again) is one list.
  const offered = new Set<string>();
  return invitations.flatMap((inv) => {
    const families = guests.filter((g) => String(g.invitationId) === String(inv._id)).flatMap((g) => {
      const f = summaries.get(String(g.familyId));
      return f?.canView ? [f] : [];
    });
    const key = families.map((f) => f.id).sort().join();
    if (!families.length || offered.has(key)) return [];
    offered.add(key);
    return [{ id: String(inv._id), kind: inv.kind, forNames: inv.forNames ?? null, firstAt: inv.firstAt.toISOString(), families }];
  });
}
const EARLIER_LISTS = 6;

const sentSince = (familyId: Types.ObjectId) => InvitationGuestModel.countDocuments({ hostFamilyId: familyId, createdAt: { $gte: new Date(Date.now() - DAY) } });

type GuestPerson = { memberId: Types.ObjectId; name: string };
/** What an invitation already has for a family: the whole household (no people), or named people. */
type Existing = Map<string, { people: GuestPerson[] }>;

/**
 * Checks who is about to be invited: households, and single people from
 * other households. Verified families the viewer may see, not their own,
 * not ones that hid this family's invitations (left out without saying
 * so). Keeps within the daily limit. Returns new guests, and existing ones
 * to change: people added, or a named invitation become the whole household.
 */
async function guestsToAdd(viewer: Viewer, host: Types.ObjectId, input: GuestsInput, existing: Existing) {
  const households = new Set(input.guestFamilyIds.filter((id) => id !== String(host)));
  const members = input.personIds.length
    ? await MemberModel.find({ _id: { $in: input.personIds.map((id) => new Types.ObjectId(id)) }, deceased: { $ne: true } }, { familyId: 1, name: 1 }).lean()
    : [];
  if (members.length < input.personIds.length) throw new AppError(400, 'VALIDATION_FAILED', 'Some of those people can’t be invited.', issue('validation.guestNotAllowed', 'personIds'));
  const peopleBy = new Map<string, GuestPerson[]>();
  for (const m of members) {
    const id = String(m.familyId);
    if (id === String(host) || households.has(id)) continue;
    peopleBy.set(id, [...(peopleBy.get(id) ?? []), { memberId: m._id, name: m.name }]);
  }
  const ids = [...new Set([...households, ...peopleBy.keys()])];
  const [families, mutes, sentToday] = await Promise.all([
    FamilyModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }, { history: 0 }).lean(),
    InvitationMuteModel.find({ mutedFamilyId: host, familyId: { $in: ids.map((id) => new Types.ObjectId(id)) } }, { familyId: 1 }).lean(),
    sentSince(host),
  ]);
  const muted = new Set(mutes.map((m) => String(m.familyId)));
  const ok = families.filter((f) => f.status === 'verified' && canViewFamily(viewer, f));
  if (ok.length < ids.length) throw new AppError(400, 'VALIDATION_FAILED', 'Some of those families can’t be invited.', issue('validation.guestNotAllowed'));
  const tree = new Set(input.treeFamilyIds);
  const linked = new Set(input.linkedFamilyIds);
  const fresh: { familyId: Types.ObjectId; via: GuestVia; people: GuestPerson[] }[] = [];
  const changes: { familyId: Types.ObjectId; people: GuestPerson[] }[] = [];
  for (const f of ok) {
    const id = String(f._id);
    if (muted.has(id)) continue;
    const people = households.has(id) ? [] : (peopleBy.get(id) ?? []);
    const before = existing.get(id);
    if (!before) {
      if (people.length > MAX_PEOPLE_PER_FAMILY) throw new AppError(400, 'VALIDATION_FAILED', 'Too many people from one family.', issue('validation.tooManyPeople', 'personIds'));
      const via: GuestVia = people.length ? 'person' : tree.has(id) ? 'tree' : linked.has(id) ? 'linked' : 'picked';
      fresh.push({ familyId: f._id, via, people });
      continue;
    }
    // Already the whole household: nothing to add.
    if (before.people.length === 0) continue;
    if (people.length === 0) changes.push({ familyId: f._id, people: [] });
    else {
      const merged = [...new Map([...before.people, ...people].map((p) => [String(p.memberId), p])).values()];
      if (merged.length > MAX_PEOPLE_PER_FAMILY) throw new AppError(400, 'VALIDATION_FAILED', 'Too many people from one family.', issue('validation.tooManyPeople', 'personIds'));
      if (merged.length > before.people.length) changes.push({ familyId: f._id, people: merged });
    }
  }
  if (sentToday + fresh.length > DAILY_INVITATION_GUESTS) {
    throw new AppError(409, 'CONFLICT', `A family can invite up to ${DAILY_INVITATION_GUESTS} families a day.`, issue('validation.dailyInvitations'));
  }
  return { fresh, changes };
}

export async function createInvitation(viewer: Viewer, input: CreateInput): Promise<InvitationDetail> {
  assertHost(viewer);
  const host = new Types.ObjectId(viewer.familyId);
  const { fresh: guests } = await guestsToAdd(viewer, host, input, new Map());
  const { functions, firstAt, lastAt } = toFunctions(input);
  const invitation = await InvitationModel.create({
    familyId: host,
    kind: input.kind,
    forNames: input.forNames,
    message: input.message,
    ...patrikaFields(input),
    memorialMemberId: await memorialOf(host, input.memorialMemberId),
    functions,
    firstAt,
    lastAt,
    sentByUserId: new Types.ObjectId(viewer.id),
    sentByName: viewer.name,
  });
  await InvitationGuestModel.insertMany(guests.map((g) => ({ ...g, invitationId: invitation._id, hostFamilyId: host, lastAt })));
  return getInvitation(viewer, String(invitation._id));
}

async function load(id: string) {
  if (!Types.ObjectId.isValid(id)) throw gone();
  const invitation = await InvitationModel.findById(id);
  if (!invitation) throw gone();
  return invitation;
}

const isHostOf = (viewer: Viewer, inv: Pick<InvitationDoc, 'familyId'>) => String(inv.familyId) === viewer.familyId;

async function loadHosted(viewer: Viewer, id: string) {
  const invitation = await load(id);
  if (!isHostOf(viewer, invitation)) throw forbidden('Only the family that sent it can change it.');
  return invitation;
}

const answersOf = (answers: { fid: string; answer: InvitationAnswer['answer']; people?: number | null; children?: number | null }[]): InvitationAnswer[] =>
  answers.map((a) => ({ functionId: a.fid, answer: a.answer, people: a.people ?? 0, children: a.children ?? 0 }));

/** A guest answered, then the host moved a time or venue: they should look again. */
const changedSince = (inv: Pick<InvitationDoc, 'changedAt'>, respondedAt: Date | null | undefined) => Boolean(respondedAt && inv.changedAt && inv.changedAt > respondedAt);

/** What guests plan around: each function's times and place. A new name alone isn't a change to plan around. */
const plan = (functions: readonly { fid: string; startsAt: Date; endsAt?: Date | null; venue: string; muhuratAt?: Date | null }[]) =>
  JSON.stringify(functions.map((f) => [f.fid, f.startsAt.getTime(), f.endsAt?.getTime() ?? null, f.venue, f.muhuratAt?.getTime() ?? null]));

function summaryOf(inv: InvitationDoc, host: LinkedFamily | undefined, extra: Partial<InvitationSummary> = {}): InvitationSummary | null {
  if (!host) return null;
  return {
    id: String(inv._id),
    kind: inv.kind,
    forNames: inv.forNames ?? null,
    host,
    firstAt: inv.firstAt.toISOString(),
    lastAt: inv.lastAt.toISOString(),
    functionCount: inv.functions.length,
    cancelled: Boolean(inv.cancelledAt),
    closed: isClosed(inv),
    ...extra,
  };
}

/** The host sees every guest and the tally; a guest sees the card and their own answers. Nobody else. */
export async function getInvitation(viewer: Viewer, id: string): Promise<InvitationDetail> {
  const invitation = await load(id);
  const host = isHostOf(viewer, invitation);
  const mine = host ? null : await InvitationGuestModel.findOne({ invitationId: invitation._id, familyId: new Types.ObjectId(viewer.familyId) }).lean();
  if (!host && !mine) throw gone();

  const [guests, linkReplies] = host
    ? await Promise.all([InvitationGuestModel.find({ invitationId: invitation._id }).sort({ createdAt: 1 }).lean(), InvitationLinkReplyModel.find({ invitationId: invitation._id }).sort({ createdAt: 1 }).lean()])
    : [[], []];
  const summaries = await familySummaries(viewer, [invitation.familyId, ...guests.map((g) => g.familyId)]);
  const base = summaryOf(invitation.toObject(), summaries.get(String(invitation.familyId)), host ? { invitedCount: guests.length, repliedCount: guests.filter((g) => g.respondedAt).length } : { answered: Boolean(mine?.respondedAt), changedSinceAnswer: changedSince(invitation, mine?.respondedAt), ...(mine?.people?.length && { forPeople: mine.people.map((p) => p.name) }) });
  if (!base) throw gone();
  const detail: InvitationDetail = {
    ...base,
    message: invitation.message ?? null,
    theme: themeFor(invitation.kind, invitation.theme),
    sentByName: invitation.sentByName,
    functions: invitation.functions.map(functionView),
    ...(await patrikaTextOf(invitation)),
    isHost: host,
    patrika: patrikaOf(invitation),
  };
  if (mine) detail.mine = { people: (mine.people ?? []).map((p) => p.name), answers: answersOf(mine.answers), stay: mine.stay ?? 0, respondedByName: mine.respondedByName ?? null, respondedAt: mine.respondedAt?.toISOString() ?? null };
  if (host) {
    detail.guests = guests.flatMap((g) => {
      const family = summaries.get(String(g.familyId));
      return family ? [{ family, via: g.via, people: (g.people ?? []).map((p) => p.name), answers: answersOf(g.answers), stay: g.stay ?? 0, respondedByName: g.respondedByName ?? null, respondedAt: g.respondedAt?.toISOString() ?? null }] : [];
    });
    detail.shareToken = invitation.shareToken ?? null;
    detail.branchShare = await branchShareOf(invitation.branchShare);
    detail.linkReplies = linkReplies.map((r) => ({ id: String(r._id), name: r.name, place: r.place ?? null, answers: answersOf(r.answers), stay: r.stay ?? 0, respondedAt: r.updatedAt.toISOString() }));
    // Families and link replies count the same in the headcount.
    detail.tally = invitation.functions.map((f) => {
      const answers = [...guests, ...linkReplies].flatMap((g) => g.answers.filter((a) => a.fid === f.fid));
      const count = (a: InvitationAnswer['answer']) => answers.filter((x) => x.answer === a).length;
      const coming = answers.filter((a) => a.answer === 'yes');
      return {
        functionId: f.fid,
        yes: count('yes'),
        maybe: count('maybe'),
        no: count('no'),
        people: coming.reduce((sum, a) => sum + (a.people ?? 0), 0),
        children: coming.reduce((sum, a) => sum + (a.children ?? 0), 0),
      };
    });
    const staying = [...guests, ...linkReplies].filter((g) => (g.stay ?? 0) > 0);
    detail.stayTally = { replies: staying.length, people: staying.reduce((sum, g) => sum + (g.stay ?? 0), 0) };
  }
  return detail;
}

export async function updateInvitation(viewer: Viewer, id: string, input: InvitationInput): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (invitation.cancelledAt) throw new AppError(409, 'CONFLICT', 'This invitation was cancelled.', issue('validation.invitationCancelled', 'invitation'));
  const { functions, firstAt, lastAt } = toFunctions(input, invitation.functions);
  if (plan(functions) !== plan(invitation.functions)) invitation.changedAt = new Date();
  invitation.kind = input.kind;
  invitation.forNames = input.forNames;
  invitation.message = input.message;
  invitation.set(patrikaFields(input));
  invitation.memorialMemberId = await memorialOf(invitation.familyId, input.memorialMemberId);
  invitation.set('functions', functions);
  invitation.firstAt = firstAt;
  invitation.lastAt = lastAt;
  await invitation.save();
  // Answers to functions that were removed go with them.
  const kept = functions.map((f) => f.fid);
  await Promise.all([
    InvitationGuestModel.updateMany({ invitationId: invitation._id }, { $set: { lastAt }, $pull: { answers: { fid: { $nin: kept } } } }),
    InvitationLinkReplyModel.updateMany({ invitationId: invitation._id }, { $pull: { answers: { fid: { $nin: kept } } } }),
  ]);
  return getInvitation(viewer, id);
}

export async function addGuests(viewer: Viewer, id: string, input: GuestsInput): Promise<InvitationDetail> {
  assertHost(viewer);
  const invitation = await loadHosted(viewer, id);
  if (isClosed(invitation)) throw new AppError(409, 'CONFLICT', 'This invitation is closed.', issue('validation.invitationClosed', 'invitation'));
  const existing: Existing = new Map(
    (await InvitationGuestModel.find({ invitationId: invitation._id }, { familyId: 1, people: 1 }).lean()).map((g) => [String(g.familyId), { people: g.people ?? [] }]),
  );
  const { fresh, changes } = await guestsToAdd(viewer, invitation.familyId, input, existing);
  await InvitationGuestModel.insertMany(fresh.map((g) => ({ ...g, invitationId: invitation._id, hostFamilyId: invitation.familyId, lastAt: invitation.lastAt })));
  await Promise.all(
    changes.map((c) =>
      InvitationGuestModel.updateOne({ invitationId: invitation._id, familyId: c.familyId }, { $set: { people: c.people, ...(c.people.length === 0 && { via: 'picked' }) } }),
    ),
  );
  return getInvitation(viewer, id);
}

export async function cancelInvitation(viewer: Viewer, id: string): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  invitation.cancelledAt = new Date();
  await invitation.save();
  return getInvitation(viewer, id);
}

const closedError = () => new AppError(409, 'CONFLICT', 'Answers are closed for this invitation.', issue('validation.invitationClosed', 'invitation'));

/** Answers for functions the invitation still has; "no" means nobody is coming. */
const cleanAnswers = (invitation: InvitationDoc, answers: RsvpInput['answers']) => {
  const known = new Set(invitation.functions.map((f) => f.fid));
  return answers
    .filter((a) => known.has(a.functionId))
    .map((a) => ({ fid: a.functionId, answer: a.answer, people: a.answer === 'no' ? 0 : a.people, children: a.answer === 'no' ? 0 : Math.min(a.children, a.people) }));
};

/**
 * Turn the link for people not on the app on or off. Turning it off and on
 * again gives a new link, so a link forwarded too widely can be stopped.
 * Replies already received stay.
 */
export async function setShareLink(viewer: Viewer, id: string, on: boolean): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (on && !invitation.shareToken) {
    if (isClosed(invitation)) throw closedError();
    invitation.shareToken = randomBytes(12).toString('base64url');
  }
  if (!on) invitation.shareToken = null;
  await invitation.save();
  return getInvitation(viewer, id);
}

async function loadShared(token: string) {
  const invitation = /^[\w-]{16}$/.test(token) ? await InvitationModel.findOne({ shareToken: token }).lean() : null;
  if (!invitation) throw gone();
  return invitation;
}

/** The card, as anyone with the link sees it: no guest list, no answers, nothing about the family beyond its name. */
export async function publicInvitation(token: string): Promise<PublicInvitation> {
  const invitation = await loadShared(token);
  const head = await MemberModel.findOne({ familyId: invitation.familyId, isHead: true }, { name: 1 }).lean();
  return {
    kind: invitation.kind,
    theme: themeFor(invitation.kind, invitation.theme),
    forNames: invitation.forNames ?? null,
    message: invitation.message ?? null,
    hostName: head?.name ?? invitation.sentByName,
    functions: invitation.functions.map(functionView),
    ...(await patrikaTextOf(invitation)),
    cancelled: Boolean(invitation.cancelledAt),
    closed: isClosed(invitation),
    patrika: patrikaOf(invitation),
  };
}

const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/**
 * Someone not on the app answers through the link. The first reply gets a
 * key the phone keeps; sending it again changes that reply instead of adding
 * another.
 */
export async function replyByLink(token: string, input: LinkReplyInput): Promise<LinkReplyReceipt> {
  const invitation = await loadShared(token);
  if (isClosed(invitation)) throw closedError();
  const fields = { name: input.name, place: input.place, answers: cleanAnswers(invitation, input.answers), stay: input.stay };
  if (input.key) {
    const updated = await InvitationLinkReplyModel.findOneAndUpdate({ invitationId: invitation._id, keyHash: hashKey(input.key) }, { $set: fields }, { new: true }).lean();
    if (updated) return { key: input.key, name: updated.name, place: updated.place ?? null, answers: answersOf(updated.answers), stay: updated.stay ?? 0 };
  }
  if ((await InvitationLinkReplyModel.countDocuments({ invitationId: invitation._id })) >= MAX_LINK_REPLIES) {
    throw new AppError(409, 'CONFLICT', 'This invitation has had as many replies through its link as it can take.', issue('validation.linkRepliesFull', 'invitation'));
  }
  const key = randomBytes(18).toString('base64url');
  const reply = await InvitationLinkReplyModel.create({ ...fields, invitationId: invitation._id, keyHash: hashKey(key) });
  return { key, name: reply.name, place: reply.place ?? null, answers: answersOf(reply.answers), stay: reply.stay ?? 0 };
}

/** The host removes a link reply: a joke, a duplicate, a stranger. */
export async function removeLinkReply(viewer: Viewer, id: string, replyId: string): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (Types.ObjectId.isValid(replyId)) await InvitationLinkReplyModel.deleteOne({ _id: new Types.ObjectId(replyId), invitationId: invitation._id });
  return getInvitation(viewer, id);
}

/** A guest family answers each function, with how many are coming. */
export async function answerInvitation(viewer: Viewer, id: string, input: RsvpInput): Promise<InvitationDetail> {
  const invitation = await load(id);
  const guest = await InvitationGuestModel.findOne({ invitationId: invitation._id, familyId: new Types.ObjectId(viewer.familyId) });
  if (!guest) throw gone();
  if (isClosed(invitation)) throw closedError();
  guest.set('answers', cleanAnswers(invitation, input.answers));
  guest.stay = input.stay;
  guest.respondedByName = viewer.name;
  guest.respondedAt = new Date();
  await guest.save();
  return getInvitation(viewer, id);
}

/** Invitations to the viewer's family and from it: coming up, and the last month's. */
export async function myInvitations(viewer: Viewer): Promise<MyInvitations> {
  const own = new Types.ObjectId(viewer.familyId);
  const since = new Date(Date.now() - 30 * DAY);
  const [guestOf, hosted, mutes] = await Promise.all([
    InvitationGuestModel.find({ familyId: own, lastAt: { $gte: since } }).sort({ lastAt: 1 }).limit(200).lean(),
    InvitationModel.find({ familyId: own, lastAt: { $gte: since } }).sort({ firstAt: 1 }).limit(100).lean(),
    InvitationMuteModel.find({ familyId: own }).lean(),
  ]);
  const muted = new Set(mutes.map((m) => String(m.mutedFamilyId)));
  const invitations = await InvitationModel.find({ _id: { $in: guestOf.map((g) => g.invitationId) } }).lean();
  const counts = hosted.length
    ? await InvitationGuestModel.aggregate<{ _id: Types.ObjectId; invited: number; replied: number }>([
        { $match: { invitationId: { $in: hosted.map((h) => h._id) } } },
        { $group: { _id: '$invitationId', invited: { $sum: 1 }, replied: { $sum: { $cond: [{ $ifNull: ['$respondedAt', false] }, 1, 0] } } } },
      ])
    : [];
  const summaries = await familySummaries(viewer, [own, ...invitations.map((i) => i.familyId), ...mutes.map((m) => m.mutedFamilyId)]);
  const byId = new Map(invitations.map((i) => [String(i._id), i]));
  const soon = { from: Date.now() - 2 * 60 * 60 * 1000, to: Date.now() + UPCOMING_WINDOW };
  const inWindow = (f: FunctionDoc) => f.startsAt.getTime() >= soon.from && f.startsAt.getTime() <= soon.to;
  const upcomingOf = (inv: InvitationDoc, hosting: boolean, going: (f: FunctionDoc) => boolean): UpcomingFunction[] => {
    const host = summaries.get(String(inv.familyId));
    if (inv.cancelledAt || !host) return [];
    return inv.functions
      .filter((f) => inWindow(f) && going(f))
      .map((f) => ({ invitationId: String(inv._id), kind: inv.kind, forNames: inv.forNames ?? null, hostName: host.headName, hosting, name: f.name, startsAt: f.startsAt.toISOString(), venue: f.venue }));
  };
  const upcoming = [
    ...hosted.flatMap((inv) => upcomingOf(inv, true, () => true)),
    ...guestOf.flatMap((g) => {
      const inv = byId.get(String(g.invitationId));
      if (!inv || muted.has(String(inv.familyId))) return [];
      return upcomingOf(inv, false, (f) => g.answers.some((a) => a.fid === f.fid && a.answer !== 'no'));
    }),
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    upcoming,
    invited: guestOf.flatMap((g) => {
      const inv = byId.get(String(g.invitationId));
      if (!inv || muted.has(String(inv.familyId))) return [];
      const s = summaryOf(inv, summaries.get(String(inv.familyId)), {
        answered: Boolean(g.respondedAt),
        changedSinceAnswer: changedSince(inv, g.respondedAt),
        ...(g.people?.length && { forPeople: g.people.map((p) => p.name) }),
      });
      return s ? [s] : [];
    }),
    hosting: hosted.flatMap((inv) => {
      const c = counts.find((x) => String(x._id) === String(inv._id));
      const s = summaryOf(inv, summaries.get(String(own)), { invitedCount: c?.invited ?? 0, repliedCount: c?.replied ?? 0 });
      return s ? [s] : [];
    }),
    hidden: mutes.flatMap((m) => {
      const f = summaries.get(String(m.mutedFamilyId));
      return f ? [f] : [];
    }),
    canHost: viewer.familyStatus === 'verified',
  };
}

/** Stop seeing a family's invitations, now and later; or see them again. */
export async function hideFamily(viewer: Viewer, familyId: string, hidden: boolean): Promise<void> {
  if (!Types.ObjectId.isValid(familyId) || familyId === viewer.familyId) throw notFound('That family is no longer in the directory.');
  const filter = { familyId: new Types.ObjectId(viewer.familyId), mutedFamilyId: new Types.ObjectId(familyId) };
  if (hidden) await InvitationMuteModel.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
  else await InvitationMuteModel.deleteOne(filter);
}

/** A PDF starts with "%PDF-"; pictures are recognised as for member photos. */
function patrikaType(data: Buffer): { ext: string } | null {
  if (data.length >= 5 && data.subarray(0, 5).toString('ascii') === '%PDF-') return { ext: 'pdf' };
  return imageType(data);
}

/** The host adds the family's printed patrika, or replaces it. */
export async function setPatrika(viewer: Viewer, id: string, data: Buffer): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (data.length > PATRIKA_MAX_BYTES) throw new AppError(400, 'VALIDATION_FAILED', 'The patrika is too large.', issue('validation.patrikaSize', 'patrika'));
  const type = patrikaType(data);
  if (!type) throw new AppError(400, 'VALIDATION_FAILED', 'Upload a photo (JPEG, PNG, WebP) or a PDF.', issue('validation.patrikaType', 'patrika'));
  const previous = invitation.patrikaKey;
  const key = `invitations/${String(invitation._id)}-${randomBytes(6).toString('hex')}.${type.ext}`;
  await storage.put(key, data);
  invitation.patrikaKey = key;
  invitation.patrikaVersion = (invitation.patrikaVersion ?? 0) + 1;
  await invitation.save();
  if (previous) await storage.remove(previous);
  return getInvitation(viewer, id);
}

export async function removePatrika(viewer: Viewer, id: string): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (invitation.patrikaKey) {
    await storage.remove(invitation.patrikaKey);
    invitation.patrikaKey = null;
    invitation.patrikaVersion = (invitation.patrikaVersion ?? 0) + 1;
    await invitation.save();
  }
  return getInvitation(viewer, id);
}

async function patrikaFile(inv: Pick<InvitationDoc, 'patrikaKey'>) {
  const missing = () => notFound('No patrika here.');
  if (!inv.patrikaKey) throw missing();
  const data = await storage.read(inv.patrikaKey);
  if (!data) throw missing();
  const ext = inv.patrikaKey.split('.').pop() ?? '';
  return { data, contentType: ext === 'pdf' ? 'application/pdf' : (CONTENT_TYPES[ext] ?? 'application/octet-stream') };
}

/** The patrika for the host and invited families. */
export async function getPatrika(viewer: Viewer, id: string) {
  const invitation = await load(id);
  if (!isHostOf(viewer, invitation) && !(await InvitationGuestModel.exists({ invitationId: invitation._id, familyId: new Types.ObjectId(viewer.familyId) }))) throw gone();
  return patrikaFile(invitation);
}

/** The patrika for anyone with the link. */
export async function getSharedPatrika(token: string) {
  return patrikaFile(await loadShared(token));
}

async function memorialPhoto(inv: Pick<InvitationDoc, 'memorialMemberId'>) {
  const missing = () => notFound('No photo here.');
  const m = inv.memorialMemberId ? await MemberModel.findById(inv.memorialMemberId, { photoKey: 1 }).lean() : null;
  if (!m?.photoKey) throw missing();
  const data = await storage.read(m.photoKey);
  if (!data) throw missing();
  return { data, contentType: CONTENT_TYPES[m.photoKey.split('.').pop() ?? ''] ?? 'application/octet-stream' };
}

/** The remembered person's photo, for the host and invited families: it is part of the card they were sent. */
export async function getMemorialPhoto(viewer: Viewer, id: string) {
  const invitation = await load(id);
  if (!isHostOf(viewer, invitation) && !(await InvitationGuestModel.exists({ invitationId: invitation._id, familyId: new Types.ObjectId(viewer.familyId) }))) throw gone();
  return memorialPhoto(invitation);
}

export async function getSharedMemorialPhoto(token: string) {
  return memorialPhoto(await loadShared(token));
}

type ShareDoc = NonNullable<InvitationDoc['branchShare']>;

async function branchShareOf(share: ShareDoc | null | undefined): Promise<BranchShareView | null> {
  if (!share) return null;
  const branch = await BranchModel.findById(share.branchId, { name: 1, nameMr: 1 }).lean();
  return {
    status: share.status,
    branch: { id: String(share.branchId), name: branch?.name ?? '', nameMr: branch?.nameMr ?? '' },
    requestedByName: share.requestedByName,
    requestedAt: share.requestedAt.toISOString(),
    decidedByName: share.decidedByName ?? null,
    decidedAt: share.decidedAt?.toISOString() ?? null,
    reason: share.reason ?? null,
    noticeId: share.noticeId ? String(share.noticeId) : null,
  };
}

/**
 * The host asks their branch committee to share the invitation with the
 * whole branch: a दशक्रिया the branch should know of, a reception open to
 * all. It makes the invitation's link, so the branch can open the card.
 */
export async function requestBranchShare(viewer: Viewer, id: string): Promise<InvitationDetail> {
  assertHost(viewer);
  const invitation = await loadHosted(viewer, id);
  if (isClosed(invitation)) throw closedError();
  if (invitation.branchShare && invitation.branchShare.status !== 'declined') {
    throw new AppError(409, 'CONFLICT', 'The committee already has this.', issue('validation.branchShareAsked', 'invitation'));
  }
  const family = await loadFamily(viewer.familyId);
  if (!invitation.shareToken) invitation.shareToken = randomBytes(12).toString('base64url');
  invitation.set('branchShare', {
    status: 'pending',
    branchId: family.branchId,
    branchAncestors: family.branchAncestors,
    requestedByName: viewer.name,
    requestedAt: new Date(),
  });
  await invitation.save();
  return getInvitation(viewer, id);
}

/** The host takes back a request the committee hasn't decided. */
export async function withdrawBranchShare(viewer: Viewer, id: string): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (invitation.branchShare?.status === 'pending') {
    invitation.set('branchShare', null);
    await invitation.save();
  }
  return getInvitation(viewer, id);
}

const inReach = (viewer: Viewer, share: Pick<ShareDoc, 'branchId' | 'branchAncestors'>) =>
  hasReach(viewer, 'notice:publish', { branchId: share.branchId, branchAncestors: share.branchAncestors });

/** Requests waiting for this committee member: families in their branch and the branches under it. */
export async function branchShareRequests(viewer: Viewer): Promise<BranchShareRequest[]> {
  if (!can(viewer.role, 'notice:publish')) throw forbidden('Only the committee can share invitations with a branch.');
  const pending = (await InvitationModel.find({ 'branchShare.status': 'pending', cancelledAt: null }).sort({ 'branchShare.requestedAt': 1 }).limit(200).lean()).filter(
    (inv) => inv.branchShare && inReach(viewer, inv.branchShare) && !isClosed(inv),
  );
  const summaries = await familySummaries(viewer, pending.map((p) => p.familyId));
  const out: BranchShareRequest[] = [];
  for (const inv of pending) {
    const base = summaryOf(inv, summaries.get(String(inv.familyId)));
    if (!base || !inv.branchShare || !inv.shareToken) continue;
    out.push({
      ...base,
      ...(await patrikaTextOf(inv)),
      message: inv.message ?? null,
      theme: themeFor(inv.kind, inv.theme),
      functions: inv.functions.map(functionView),
      shareToken: inv.shareToken,
      requestedByName: inv.branchShare.requestedByName,
      requestedAt: inv.branchShare.requestedAt.toISOString(),
    });
  }
  return out;
}

async function loadRequest(viewer: Viewer, id: string) {
  const invitation = await load(id);
  const share = invitation.branchShare;
  if (!share || share.status !== 'pending' || !inReach(viewer, share)) throw notFound('That request is no longer waiting.');
  return { invitation, share };
}

/**
 * The committee shares it: a notice to the family's branch, in the words they
 * checked, with the invitation's link so everyone there can open the card and
 * reply. A remembrance is posted as a condolence.
 */
export async function approveBranchShare(viewer: Viewer, id: string, input: z.output<typeof approveBranchShareSchema>): Promise<BranchShareView> {
  const { invitation, share } = await loadRequest(viewer, id);
  if (isClosed(invitation)) throw closedError();
  if (!invitation.shareToken) throw new AppError(409, 'CONFLICT', 'The family stopped the invitation link.', issue('validation.branchShareNoLink', 'invitation'));
  const notice = await NoticeModel.create({
    title: input.title,
    body: input.body,
    kind: REMEMBRANCE_KINDS.includes(invitation.kind) ? 'condolence' : 'celebration',
    branchId: share.branchId,
    branchAncestors: share.branchAncestors,
    authorUserId: new Types.ObjectId(viewer.id),
    authorName: viewer.name,
  });
  invitation.set({ 'branchShare.status': 'shared', 'branchShare.decidedByName': viewer.name, 'branchShare.decidedAt': new Date(), 'branchShare.noticeId': notice._id });
  await invitation.save();
  return (await branchShareOf(invitation.branchShare)) as BranchShareView;
}

export async function declineBranchShare(viewer: Viewer, id: string, input: z.output<typeof declineBranchShareSchema>): Promise<BranchShareView> {
  const { invitation } = await loadRequest(viewer, id);
  invitation.set({ 'branchShare.status': 'declined', 'branchShare.decidedByName': viewer.name, 'branchShare.decidedAt': new Date(), 'branchShare.reason': input.reason });
  await invitation.save();
  return (await branchShareOf(invitation.branchShare)) as BranchShareView;
}
