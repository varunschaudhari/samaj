import {
  DAILY_INVITATION_GUESTS,
  type LinkReplyReceipt,
  MAX_LINK_REPLIES,
  PATRIKA_MAX_BYTES,
  type PatrikaView,
  type PublicInvitation,
  type GuestVia,
  type InvitationAnswer,
  type InvitationAudience,
  type InvitationDetail,
  type InvitationSummary,
  type LinkedFamily,
  type MyInvitations,
  type addGuestsSchema,
  type createInvitationSchema,
  type invitationInputSchema,
  type invitationRsvpSchema,
  type linkReplySchema,
} from '@samaj/shared';
import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { FamilyModel } from '../models/family.model';
import { type InvitationDoc, InvitationGuestModel, InvitationLinkReplyModel, InvitationModel, InvitationMuteModel } from '../models/invitation.model';
import { MemberModel } from '../models/member.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { storage } from '../utils/storage';
import { canViewFamily } from './access';
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
/** Answers close half a day after the last function. */
const CLOSES_AFTER = 12 * 60 * 60 * 1000;
const gone = () => notFound('That invitation is no longer there.');
const issue = (message: string, path = 'guestFamilyIds') => [{ path, message }];

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
    }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const firstAt = functions[0]?.startsAt ?? new Date();
  const lastAt = new Date(Math.max(...functions.map((f) => (f.endsAt ?? f.startsAt).getTime())));
  return { functions, firstAt, lastAt };
}

/** Families the host may pick from: everyone in their family tree, and their linked families. */
export async function audienceFor(viewer: Viewer): Promise<InvitationAudience> {
  assertHost(viewer);
  const own = await loadFamily(viewer.familyId);
  const [tree, links, sentToday] = await Promise.all([getTree(viewer, viewer.familyId).catch(() => null), linksOf(viewer, own), sentSince(own._id)]);
  const seen = new Set([viewer.familyId]);
  const once = (families: LinkedFamily[]) =>
    families.filter((f) => {
      if (!f.canView || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  return {
    tree: once([...(tree?.households.map((h) => h.family) ?? []), ...(tree?.side.map((s) => s.family) ?? [])]),
    linked: once(links.map((l) => l.family)),
    leftToday: Math.max(0, DAILY_INVITATION_GUESTS - sentToday),
  };
}

const sentSince = (familyId: Types.ObjectId) => InvitationGuestModel.countDocuments({ hostFamilyId: familyId, createdAt: { $gte: new Date(Date.now() - DAY) } });

/**
 * Checks the families about to be invited: verified families the viewer may
 * see, not their own, not already invited, and not ones that hid this
 * family's invitations (left out without saying so). Keeps within the daily
 * limit.
 */
async function guestsToAdd(viewer: Viewer, host: Types.ObjectId, input: GuestsInput, already: Set<string>) {
  const ids = input.guestFamilyIds.filter((id) => id !== String(host) && !already.has(id));
  const [families, mutes, sentToday] = await Promise.all([
    FamilyModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } }, { history: 0 }).lean(),
    InvitationMuteModel.find({ mutedFamilyId: host, familyId: { $in: ids.map((id) => new Types.ObjectId(id)) } }, { familyId: 1 }).lean(),
    sentSince(host),
  ]);
  const muted = new Set(mutes.map((m) => String(m.familyId)));
  const ok = families.filter((f) => f.status === 'verified' && canViewFamily(viewer, f));
  if (ok.length < ids.length) throw new AppError(400, 'VALIDATION_FAILED', 'Some of those families can’t be invited.', issue('validation.guestNotAllowed'));
  if (sentToday + ok.length > DAILY_INVITATION_GUESTS) {
    throw new AppError(409, 'CONFLICT', `A family can invite up to ${DAILY_INVITATION_GUESTS} families a day.`, issue('validation.dailyInvitations'));
  }
  const tree = new Set(input.treeFamilyIds);
  const linked = new Set(input.linkedFamilyIds);
  return ok
    .filter((f) => !muted.has(String(f._id)))
    .map((f) => ({ familyId: f._id, via: (tree.has(String(f._id)) ? 'tree' : linked.has(String(f._id)) ? 'linked' : 'picked') as GuestVia }));
}

export async function createInvitation(viewer: Viewer, input: CreateInput): Promise<InvitationDetail> {
  assertHost(viewer);
  const host = new Types.ObjectId(viewer.familyId);
  const guests = await guestsToAdd(viewer, host, input, new Set());
  const { functions, firstAt, lastAt } = toFunctions(input);
  const invitation = await InvitationModel.create({
    familyId: host,
    kind: input.kind,
    forNames: input.forNames,
    message: input.message,
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

const answersOf = (answers: { fid: string; answer: InvitationAnswer['answer']; people?: number | null }[]): InvitationAnswer[] =>
  answers.map((a) => ({ functionId: a.fid, answer: a.answer, people: a.people ?? 0 }));

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
  const base = summaryOf(invitation.toObject(), summaries.get(String(invitation.familyId)), host ? { invitedCount: guests.length, repliedCount: guests.filter((g) => g.respondedAt).length } : { answered: Boolean(mine?.respondedAt) });
  if (!base) throw gone();
  const detail: InvitationDetail = {
    ...base,
    message: invitation.message ?? null,
    sentByName: invitation.sentByName,
    functions: invitation.functions.map((f) => ({ id: f.fid, name: f.name, startsAt: f.startsAt.toISOString(), endsAt: f.endsAt?.toISOString() ?? null, venue: f.venue, mapUrl: f.mapUrl ?? null })),
    isHost: host,
    patrika: patrikaOf(invitation),
  };
  if (mine) detail.mine = { answers: answersOf(mine.answers), respondedByName: mine.respondedByName ?? null, respondedAt: mine.respondedAt?.toISOString() ?? null };
  if (host) {
    detail.guests = guests.flatMap((g) => {
      const family = summaries.get(String(g.familyId));
      return family ? [{ family, via: g.via, answers: answersOf(g.answers), respondedByName: g.respondedByName ?? null, respondedAt: g.respondedAt?.toISOString() ?? null }] : [];
    });
    detail.shareToken = invitation.shareToken ?? null;
    detail.linkReplies = linkReplies.map((r) => ({ id: String(r._id), name: r.name, place: r.place ?? null, answers: answersOf(r.answers), respondedAt: r.updatedAt.toISOString() }));
    // Families and link replies count the same in the headcount.
    detail.tally = invitation.functions.map((f) => {
      const answers = [...guests, ...linkReplies].flatMap((g) => g.answers.filter((a) => a.fid === f.fid));
      const count = (a: InvitationAnswer['answer']) => answers.filter((x) => x.answer === a).length;
      return { functionId: f.fid, yes: count('yes'), maybe: count('maybe'), no: count('no'), people: answers.filter((a) => a.answer === 'yes').reduce((sum, a) => sum + (a.people ?? 0), 0) };
    });
  }
  return detail;
}

export async function updateInvitation(viewer: Viewer, id: string, input: InvitationInput): Promise<InvitationDetail> {
  const invitation = await loadHosted(viewer, id);
  if (invitation.cancelledAt) throw new AppError(409, 'CONFLICT', 'This invitation was cancelled.', issue('validation.invitationCancelled', 'invitation'));
  const { functions, firstAt, lastAt } = toFunctions(input, invitation.functions);
  invitation.kind = input.kind;
  invitation.forNames = input.forNames;
  invitation.message = input.message;
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
  const already = new Set((await InvitationGuestModel.find({ invitationId: invitation._id }, { familyId: 1 }).lean()).map((g) => String(g.familyId)));
  const guests = await guestsToAdd(viewer, invitation.familyId, input, already);
  await InvitationGuestModel.insertMany(guests.map((g) => ({ ...g, invitationId: invitation._id, hostFamilyId: invitation.familyId, lastAt: invitation.lastAt })));
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
  return answers.filter((a) => known.has(a.functionId)).map((a) => ({ fid: a.functionId, answer: a.answer, people: a.answer === 'no' ? 0 : a.people }));
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
    forNames: invitation.forNames ?? null,
    message: invitation.message ?? null,
    hostName: head?.name ?? invitation.sentByName,
    functions: invitation.functions.map((f) => ({ id: f.fid, name: f.name, startsAt: f.startsAt.toISOString(), endsAt: f.endsAt?.toISOString() ?? null, venue: f.venue, mapUrl: f.mapUrl ?? null })),
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
  const fields = { name: input.name, place: input.place, answers: cleanAnswers(invitation, input.answers) };
  if (input.key) {
    const updated = await InvitationLinkReplyModel.findOneAndUpdate({ invitationId: invitation._id, keyHash: hashKey(input.key) }, { $set: fields }, { new: true }).lean();
    if (updated) return { key: input.key, name: updated.name, place: updated.place ?? null, answers: answersOf(updated.answers) };
  }
  if ((await InvitationLinkReplyModel.countDocuments({ invitationId: invitation._id })) >= MAX_LINK_REPLIES) {
    throw new AppError(409, 'CONFLICT', 'This invitation has had as many replies through its link as it can take.', issue('validation.linkRepliesFull', 'invitation'));
  }
  const key = randomBytes(18).toString('base64url');
  const reply = await InvitationLinkReplyModel.create({ ...fields, invitationId: invitation._id, keyHash: hashKey(key) });
  return { key, name: reply.name, place: reply.place ?? null, answers: answersOf(reply.answers) };
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
  return {
    invited: guestOf.flatMap((g) => {
      const inv = byId.get(String(g.invitationId));
      if (!inv || muted.has(String(inv.familyId))) return [];
      const s = summaryOf(inv, summaries.get(String(inv.familyId)), { answered: Boolean(g.respondedAt) });
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
