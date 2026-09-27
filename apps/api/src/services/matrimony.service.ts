import {
  ELIGIBLE_RELATIONS,
  isGlobalRole,
  type FieldIssue,
  MIN_MARRIAGE_AGE,
  type MyMatrimony,
  type ProfileCard,
  type ProfileDetail,
  type ProfilePage,
  type closeProfileSchema,
  type profileCreateSchema,
  type profileFieldsSchema,
  type profileSearchSchema,
} from '@samaj/shared';
import { type HydratedDocument, type QueryFilter, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { InterestModel } from '../models/interest.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { type ProfileDoc, ProfileModel } from '../models/profile.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { cappedCount } from '../utils/count';
import { inBranch } from './audience';
import { escapeRegex } from '../utils/regex';
import { canBrowseDirectory, canEditFamily, canManageProfile, canReviewProfile, canViewProfile } from './access';
import { photoUrl } from './family.service';
import { notVerified } from './member.service';
import type { Viewer } from './viewer';

type Fields = z.output<typeof profileFieldsSchema>;
type CreateInput = z.output<typeof profileCreateSchema>;
type SearchQuery = z.output<typeof profileSearchSchema>;
type ProfileDocument = HydratedDocument<ProfileDoc>;

export const ageOf = (birthYear: number | null | undefined) => (birthYear ? new Date().getFullYear() - birthYear : null);

const profileGone = () => notFound('That profile is no longer available.');
const issue = (message: string, path = 'profile'): FieldIssue[] => [{ path, message }];

/** Why a family member can't have a profile, or null if they can. */
export function ineligibility(member: Pick<MemberDoc, 'relation' | 'gender' | 'birthYear'>, familyHasSpouse: boolean): 'married' | 'noBirthYear' | 'tooYoung' | null {
  const relationOk = (ELIGIBLE_RELATIONS as readonly string[]).includes(member.relation) || (member.relation === 'head' && !familyHasSpouse);
  if (!relationOk) return 'married';
  if (!member.birthYear) return 'noBirthYear';
  const age = ageOf(member.birthYear) ?? 0;
  return age < MIN_MARRIAGE_AGE[member.gender] ? 'tooYoung' : null;
}

/** Cards for a set of profiles: name, photo and place come from the member record. */
export async function toCards(profiles: Pick<ProfileDoc, '_id' | 'memberId' | 'familyId' | 'gender' | 'birthYear' | 'gotra' | 'heightCm' | 'education' | 'occupation' | 'branchId' | 'status'>[]): Promise<ProfileCard[]> {
  const [members, branches] = await Promise.all([
    MemberModel.find({ _id: { $in: profiles.map((p) => p.memberId) } }).lean(),
    BranchModel.find({ _id: { $in: profiles.map((p) => p.branchId) } }).lean(),
  ]);
  const memberBy = new Map(members.map((m) => [String(m._id), m]));
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  return profiles.flatMap((p) => {
    const m = memberBy.get(String(p.memberId));
    if (!m) return [];
    const b = branchBy.get(String(p.branchId));
    return [
      {
        id: String(p._id),
        memberId: String(p.memberId),
        familyId: String(p.familyId),
        name: m.name,
        gender: p.gender,
        age: ageOf(p.birthYear),
        gotra: p.gotra ?? null,
        heightCm: p.heightCm ?? null,
        education: p.education ?? null,
        occupation: p.occupation ?? null,
        place: m.place,
        branch: { id: String(p.branchId), name: b?.name ?? '', nameMr: b?.nameMr ?? '' },
        photoUrl: photoUrl(m),
        status: p.status,
      },
    ];
  });
}

async function loadProfile(id: string): Promise<ProfileDocument> {
  if (!Types.ObjectId.isValid(id)) throw profileGone();
  const profile = await ProfileModel.findById(id);
  if (!profile) throw profileGone();
  return profile;
}

async function loadManageable(viewer: Viewer, id: string) {
  const profile = await loadProfile(id);
  if (!canViewProfile(viewer, profile)) throw profileGone();
  if (!canManageProfile(viewer, profile)) throw forbidden('Only the family can change this profile.');
  return profile;
}

/** Withdraw every open interest to or from a profile (when it closes). */
async function withdrawOpenInterests(profileId: Types.ObjectId) {
  await InterestModel.updateMany(
    { $or: [{ fromProfileId: profileId }, { toProfileId: profileId }], status: 'pending' },
    { $set: { status: 'withdrawn', respondedAt: new Date() } },
  );
}

/** The viewer's family: its profiles, and who else could have one. */
export async function getMine(viewer: Viewer): Promise<MyMatrimony> {
  const familyId = new Types.ObjectId(viewer.familyId);
  const [profiles, members] = await Promise.all([ProfileModel.find({ familyId }).sort({ createdAt: 1 }).lean(), MemberModel.find({ familyId }).lean()]);
  const cards = await toCards(profiles);
  const hasSpouse = members.some((m) => m.relation === 'spouse');
  const withProfile = new Set(profiles.map((p) => String(p.memberId)));

  const eligible: MyMatrimony['eligible'] = [];
  const ineligible: MyMatrimony['ineligible'] = [];
  for (const m of members) {
    if (withProfile.has(String(m._id))) continue;
    const why = ineligibility(m, hasSpouse);
    if (why === null) eligible.push({ memberId: String(m._id), name: m.name, gender: m.gender, age: ageOf(m.birthYear) ?? 0 });
    else if (why !== 'married') ineligible.push({ memberId: String(m._id), name: m.name, reason: why });
  }

  const extra = new Map(profiles.map((p) => [String(p._id), p]));
  return {
    profiles: cards.map((c) => ({ ...c, closeReason: extra.get(c.id)?.closeReason ?? null, moderationNote: extra.get(c.id)?.moderationNote ?? null })),
    eligible,
    ineligible,
  };
}

export async function createProfile(viewer: Viewer, input: CreateInput): Promise<ProfileDetail> {
  const member = await MemberModel.findById(input.memberId);
  if (!member) throw new AppError(400, 'VALIDATION_FAILED', 'Pick someone from your family.', issue('validation.profileNotEligible', 'memberId'));
  const family = await FamilyModel.findById(member.familyId);
  if (!family || !canEditFamily(viewer, family)) throw forbidden('Only the family can create a profile for this person.');
  if (family.status !== 'verified') throw notVerified();
  if (member.approval === 'pending') {
    throw new AppError(409, 'CONFLICT', 'The committee hasn’t approved this person yet.', issue('validation.memberPending', 'memberId'));
  }

  const hasSpouse = Boolean(await MemberModel.exists({ familyId: family._id, relation: 'spouse' }));
  const why = ineligibility(member, hasSpouse);
  if (why) {
    const key = why === 'noBirthYear' ? 'validation.profileNoBirthYear' : why === 'tooYoung' ? 'validation.profileTooYoung' : 'validation.profileNotEligible';
    throw new AppError(400, 'VALIDATION_FAILED', 'This person can’t have a matrimonial profile.', issue(key, 'memberId'));
  }
  if (await ProfileModel.exists({ memberId: member._id })) {
    throw new AppError(409, 'CONFLICT', 'This person already has a profile.', issue('validation.profileExists', 'memberId'));
  }

  const birthYear = member.birthYear;
  if (!birthYear) throw new AppError(400, 'VALIDATION_FAILED', 'Add a birth year first.', issue('validation.profileNoBirthYear', 'memberId'));

  const { memberId: _memberId, consent: _consent, ...fields } = input;
  const profile = await ProfileModel.create({
    ...fields,
    memberId: member._id,
    familyId: family._id,
    consentByUserId: new Types.ObjectId(viewer.id),
    consentAt: new Date(),
    gender: member.gender,
    birthYear,
    gotra: family.gotra,
    branchId: family.branchId,
    branchAncestors: family.branchAncestors,
  });
  return getProfile(viewer, String(profile._id));
}

export async function updateProfile(viewer: Viewer, id: string, fields: Fields): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  if (profile.status === 'closed') throw new AppError(409, 'CONFLICT', 'This profile is closed.', issue('validation.profileClosed'));
  Object.assign(profile, fields);
  await profile.save();
  return getProfile(viewer, id);
}

/** Pause hides a live profile from search for a while; resume brings it back. */
export async function setPaused(viewer: Viewer, id: string, paused: boolean): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  const from = paused ? 'active' : 'paused';
  if (profile.status !== from) throw new AppError(409, 'CONFLICT', 'The profile changed meanwhile. Reload to see the latest.', issue('validation.profileChanged'));
  profile.status = paused ? 'paused' : 'active';
  await profile.save();
  return getProfile(viewer, id);
}

/** Married or withdrawn: out of search for good, and open interests are withdrawn. */
export async function closeProfile(viewer: Viewer, id: string, reason: z.output<typeof closeProfileSchema>['reason']): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  if (profile.status === 'closed') return getProfile(viewer, id);
  profile.status = 'closed';
  profile.closeReason = reason;
  await profile.save();
  await withdrawOpenInterests(profile._id);
  return getProfile(viewer, id);
}

export async function resubmitProfile(viewer: Viewer, id: string): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  if (profile.status !== 'rejected') throw new AppError(409, 'CONFLICT', 'This profile is not waiting on changes.', issue('validation.profileChanged'));
  profile.status = 'pending';
  profile.submittedAt = new Date();
  await profile.save();
  return getProfile(viewer, id);
}

/** Contact details are the family's own, or shared after an accepted interest either way. */
async function interestWithViewer(viewer: Viewer, profile: Pick<ProfileDoc, '_id'>) {
  const viewerFamily = new Types.ObjectId(viewer.familyId);
  return InterestModel.findOne({
    $or: [
      { toProfileId: profile._id, fromFamilyId: viewerFamily },
      { fromProfileId: profile._id, toFamilyId: viewerFamily },
    ],
  })
    .sort({ updatedAt: -1 })
    .lean();
}

export async function getProfile(viewer: Viewer, id: string): Promise<ProfileDetail> {
  const profile = await loadProfile(id);
  if (!canViewProfile(viewer, profile)) throw profileGone();
  const [card] = await toCards([profile]);
  if (!card) throw profileGone();

  const own = String(profile.familyId) === viewer.familyId;
  const canReview = canReviewProfile(viewer, profile);
  const interest = own ? null : await interestWithViewer(viewer, profile);
  const showContact = own || interest?.status === 'accepted';

  const detail: ProfileDetail = {
    ...card,
    income: profile.income ?? null,
    manglik: profile.manglik ?? null,
    maternalGotra: profile.maternalGotra ?? null,
    about: profile.about ?? null,
    expectations: profile.expectations ?? null,
    closeReason: profile.closeReason ?? null,
    permissions: { canEdit: canManageProfile(viewer, profile), canReview },
    interest: interest
      ? {
          id: String(interest._id),
          status: interest.status,
          sentByViewer: String(interest.fromFamilyId) === viewer.familyId,
          fromProfileId: String(interest.fromProfileId),
          toProfileId: String(interest.toProfileId),
        }
      : null,
  };
  if (showContact) detail.contact = { name: profile.contactName, phone: profile.contactPhone };
  if (own || canReview) detail.moderationNote = profile.moderationNote ?? null;
  return detail;
}

function encodeCursor(p: { activatedAt?: Date | null; _id: Types.ObjectId }): string {
  return Buffer.from(JSON.stringify([(p.activatedAt ?? new Date(0)).toISOString(), String(p._id)])).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: Types.ObjectId } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && Types.ObjectId.isValid(parsed[1])) {
      return { at: new Date(parsed[0]), id: new Types.ObjectId(parsed[1]) };
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'The page link is invalid. Reload the list.');
}

/**
 * Search on behalf of one of the viewer's own live profiles: opposite gender,
 * never the same gotra, never the viewer's own family. Newest first.
 */
export async function search(viewer: Viewer, query: SearchQuery): Promise<ProfilePage> {
  if (!canBrowseDirectory(viewer)) throw notVerified();
  const own = await loadProfile(query.forProfile);
  if (String(own.familyId) !== viewer.familyId) throw forbidden('Search for one of your own family’s profiles.');
  if (own.status !== 'active') {
    throw new AppError(409, 'CONFLICT', 'This profile isn’t live, so it can’t search yet.', issue('validation.profileNotActive'));
  }

  const year = new Date().getFullYear();
  const conditions: QueryFilter<ProfileDoc>[] = [
    { status: 'active' },
    // An equality (not $ne) so the index gives the newest-first order.
    { gender: own.gender === 'male' ? 'female' : 'male' },
    { familyId: { $ne: own.familyId } },
  ];
  // The gotra rule. Profiles whose family hasn't recorded a gotra still appear.
  if (own.gotra) conditions.push({ gotra: { $ne: own.gotra } });
  if (query.ageMin) conditions.push({ birthYear: { $lte: year - query.ageMin } });
  if (query.ageMax) conditions.push({ birthYear: { $gte: year - query.ageMax } });
  if (query.branchId) {
    conditions.push(inBranch(query.branchId));
  }
  if (query.education) conditions.push({ education: new RegExp(`(^|[\\s.,/(])${escapeRegex(query.education)}`, 'i') });

  const base: QueryFilter<ProfileDoc> = { $and: conditions };
  const page: QueryFilter<ProfileDoc> = { $and: [...conditions] };
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    page.$and?.push({ $or: [{ activatedAt: { $lt: after.at } }, { activatedAt: after.at, _id: { $lt: after.id } }] });
  }

  const [docs, total] = await Promise.all([
    ProfileModel.find(page).sort({ activatedAt: -1, _id: -1 }).limit(query.limit + 1).lean(),
    cappedCount(ProfileModel, base),
  ]);
  const hasMore = docs.length > query.limit;
  const items = hasMore ? docs.slice(0, query.limit) : docs;
  const last = items.at(-1);
  return { items: await toCards(items), total, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/* ---------- Committee review ---------- */

function reviewScope(viewer: Viewer): QueryFilter<ProfileDoc> {
  const filter: QueryFilter<ProfileDoc> = { status: 'pending' };
  if (!isGlobalRole(viewer.role)) {
    Object.assign(filter, inBranch(viewer.branchId));
    filter.familyId = { $ne: new Types.ObjectId(viewer.familyId) };
  }
  return filter;
}

export async function listPendingProfiles(viewer: Viewer): Promise<ProfileCard[]> {
  if (viewer.role === 'member') throw forbidden('Only the branch committee reviews profiles.');
  const docs = await ProfileModel.find(reviewScope(viewer)).sort({ submittedAt: 1 }).limit(100).lean();
  return toCards(docs);
}

export async function countPendingProfiles(viewer: Viewer): Promise<number> {
  if (viewer.role === 'member') return 0;
  return ProfileModel.countDocuments(reviewScope(viewer));
}

async function loadReviewable(viewer: Viewer, id: string, allowed: ProfileDoc['status'][]) {
  const profile = await loadProfile(id);
  if (!canViewProfile(viewer, profile)) throw profileGone();
  if (!canReviewProfile(viewer, profile)) throw forbidden('Another committee member needs to review this profile.');
  if (!allowed.includes(profile.status)) throw new AppError(409, 'CONFLICT', 'This profile was already reviewed. Reload to see the latest.', issue('validation.profileChanged'));
  return profile;
}

export async function approveProfile(viewer: Viewer, id: string): Promise<ProfileDetail> {
  const profile = await loadReviewable(viewer, id, ['pending']);
  profile.status = 'active';
  profile.activatedAt = new Date();
  profile.moderationNote = null;
  profile.reviewedByUserId = new Types.ObjectId(viewer.id);
  await profile.save();
  return getProfile(viewer, id);
}

export async function rejectProfile(viewer: Viewer, id: string, reason: string): Promise<ProfileDetail> {
  const profile = await loadReviewable(viewer, id, ['pending']);
  profile.status = 'rejected';
  profile.moderationNote = reason;
  profile.reviewedByUserId = new Types.ObjectId(viewer.id);
  await profile.save();
  return getProfile(viewer, id);
}

/** Take down a live or paused profile, with a note the family sees. */
export async function removeProfile(viewer: Viewer, id: string, reason: string): Promise<ProfileDetail> {
  const profile = await loadReviewable(viewer, id, ['active', 'paused']);
  profile.status = 'closed';
  profile.closeReason = 'removed';
  profile.moderationNote = reason;
  profile.reviewedByUserId = new Types.ObjectId(viewer.id);
  await profile.save();
  await withdrawOpenInterests(profile._id);
  return getProfile(viewer, id);
}

/* ---------- Keeping copies in sync (called by the family service) ---------- */

export async function syncFamilyGotra(familyId: Types.ObjectId, gotra: string | null) {
  await ProfileModel.updateMany({ familyId }, { $set: { gotra } });
}

export async function syncMember(member: Pick<MemberDoc, '_id' | 'gender' | 'birthYear'>) {
  // A profile needs a birth year; if it was cleared, keep the last known one.
  await ProfileModel.updateOne({ memberId: member._id }, { $set: { gender: member.gender, ...(member.birthYear && { birthYear: member.birthYear }) } });
}

/** A removed family member's profile closes, and their open interests are withdrawn. */
/** The person married and moved to another family: their profile closes as 'married' and open interests end. */
export async function closeForMarriage(memberId: Types.ObjectId) {
  const profile = await ProfileModel.findOne({ memberId, status: { $ne: 'closed' } });
  if (!profile) return;
  profile.status = 'closed';
  profile.closeReason = 'married';
  await profile.save();
  await withdrawOpenInterests(profile._id);
}

export async function closeForRemovedMember(memberId: Types.ObjectId) {
  const profile = await ProfileModel.findOne({ memberId });
  if (!profile) return;
  await withdrawOpenInterests(profile._id);
  await profile.deleteOne();
}
