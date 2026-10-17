import { randomBytes } from 'node:crypto';
import {
  ELIGIBLE_RELATIONS,
  EMPTY_PREFERENCES,
  EMPTY_SIBLINGS,
  MAX_PROFILE_PHOTOS,
  PHOTO_MAX_BYTES,
  type MarkKind,
  type Preferences,
  type ProfilePrefill,
  incomeBandOf,
  profileMissingFields,
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
import type { GotraId } from '@samaj/shared';
import { type HydratedDocument, type QueryFilter, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { InterestModel } from '../models/interest.model';
import { MarkModel } from '../models/mark.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { type ProfileDoc, ProfileModel } from '../models/profile.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { cappedCount } from '../utils/count';
import { inBranch } from './audience';
import { escapeRegex } from '../utils/regex';
import { canBrowseDirectory, canEditFamily, canManageProfile, canReviewProfile, canViewProfile } from './access';
import { storage } from '../utils/storage';
import { CONTENT_TYPES, imageType, photoUrl } from './family.service';
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

type Photo = { _id: Types.ObjectId; key: string };
const photosOf = (p: { photos?: unknown }): Photo[] => (p.photos ?? []) as Photo[];

/** Profile photos are served by id, through the same access check as the profile. */
const profilePhotoUrl = (profileId: Types.ObjectId | string, photo: Photo) => `/api/matrimony/profiles/${String(profileId)}/photos/${String(photo._id)}`;

type CardSource = Pick<ProfileDoc, '_id' | 'memberId' | 'familyId' | 'gender' | 'birthYear' | 'gotra' | 'heightCm' | 'education' | 'occupation' | 'branchId' | 'status'> & {
  maritalStatus?: ProfileDoc['maritalStatus'];
  photos?: unknown;
};

/** Cards for a set of profiles: name and place come from the member record; the photo is the profile's own, else the family photo. */
export async function toCards(profiles: CardSource[]): Promise<ProfileCard[]> {
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
        photoUrl: photosOf(p)[0] ? profilePhotoUrl(p._id, photosOf(p)[0] as Photo) : photoUrl(m),
        maritalStatus: p.maritalStatus ?? null,
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
    if (withProfile.has(String(m._id)) || m.deceased) continue;
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

/**
 * Checks the schema can't make: the birth date's year matches the person's
 * birth year, and preferred branches exist (unknown ones are dropped).
 */
async function checkFields<T extends Fields>(fields: T, birthYear: number): Promise<T> {
  if (fields.birthDate && Number(fields.birthDate.slice(0, 4)) !== birthYear) {
    throw new AppError(400, 'VALIDATION_FAILED', `The date of birth should be in ${birthYear}, the birth year on the family page.`, issue('validation.birthDateYear', 'birthDate'));
  }
  const wanted = fields.preferences.branchIds;
  if (wanted.length) {
    const found = await BranchModel.find({ _id: { $in: wanted } }, { _id: 1 }).lean();
    const known = new Set(found.map((b) => String(b._id)));
    fields.preferences.branchIds = wanted.filter((id) => known.has(id));
  }
  return fields;
}

/** What the profile still lacks for the committee. Kul comes from the family page. */
export function missingFor(profile: ProfileDoc | ProfileDocument) {
  const plain = 'toObject' in profile ? profile.toObject() : profile;
  return profileMissingFields(plain, plain.gotra ?? null);
}

/** Refuses to go further while required fields are missing, naming each one so the form can show it. */
export function assertComplete(profile: ProfileDoc | ProfileDocument) {
  const missing = missingFor(profile);
  if (missing.length) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      'Fill in the required details first.',
      missing.map((path) => ({ path, message: path === 'gotra' ? 'validation.profileIncomplete' : 'validation.required' })),
    );
  }
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
  if (member.deceased) throw new AppError(400, 'VALIDATION_FAILED', 'Pick someone from your family.', issue('validation.profileNotEligible', 'memberId'));

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

  const { memberId: _memberId, consent: _consent, submit, ...rest } = input;
  const fields = await checkFields(rest, birthYear);
  const profile = new ProfileModel({
    ...fields,
    status: submit ? 'pending' : 'draft',
    memberId: member._id,
    familyId: family._id,
    consentByUserId: new Types.ObjectId(viewer.id),
    consentAt: new Date(),
    gender: member.gender,
    birthYear,
    gotra: family.gotra,
    ...(await birthGotraOf(member)),
    branchId: family.branchId,
    branchAncestors: family.branchAncestors,
  });
  // A draft may be incomplete; sending it straight to the committee may not.
  if (submit) assertComplete(profile);
  await profile.save();
  return getProfile(viewer, String(profile._id));
}

/** "Given Surname" on the family page, as "Surname Given" for the samaj form. */
const surnameFirst = (name: string) => {
  const words = name.trim().split(/\s+/);
  return words.length > 1 ? [words.at(-1), ...words.slice(0, -1)].join(' ') : name;
};

/**
 * A head start on someone's profile from what the family page already knows:
 * their names, parents, brothers and sisters, the family's place and address,
 * phone numbers, and (when the mother's माहेर is linked) the mama's kul.
 */
export async function prefillFor(viewer: Viewer, memberId: string): Promise<ProfilePrefill> {
  if (!Types.ObjectId.isValid(memberId)) throw notFound('That person is no longer in this family.');
  const member = await MemberModel.findById(memberId).lean();
  if (!member) throw notFound('That person is no longer in this family.');
  const family = await FamilyModel.findById(member.familyId);
  if (!family || !canEditFamily(viewer, family)) throw forbidden('Only the family can create a profile for this person.');

  const everyone = (await MemberModel.find({ familyId: family._id, deceased: { $ne: true } }).lean()).filter((m) => String(m._id) !== memberId);
  const head = everyone.find((m) => m.isHead);
  const partnerOf = (p: (typeof everyone)[number] | undefined) =>
    p ? everyone.find((m) => String(m.partnerId) === String(p._id) || String(p.partnerId) === String(m._id) || (p.isHead && m.relation === 'spouse')) : undefined;

  // Their parents: the tree's parent if recorded, otherwise the head for a son or daughter; and that parent's spouse.
  const parent = member.parentId ? everyone.find((m) => String(m._id) === String(member.parentId)) : ['son', 'daughter'].includes(member.relation) ? head : undefined;
  const otherParent = partnerOf(parent);
  const father = [parent, otherParent].find((p) => p?.gender === 'male');
  const mother = [parent, otherParent].find((p) => p?.gender === 'female');

  // Brothers and sisters: the other children of the same parents. A sibling with a spouse in the family counts as married.
  const siblings = parent
    ? everyone.filter((m) =>
        member.parentId ? String(m.parentId) === String(member.parentId) : ['son', 'daughter'].includes(m.relation) && !m.parentId,
      )
    : [];
  const married = (m: (typeof everyone)[number]) => Boolean(partnerOf(m));
  const brothers = siblings.filter((m) => m.gender === 'male');
  const sisters = siblings.filter((m) => m.gender === 'female');

  // The mama's kul is the kul of the mother's माहेर, when her father there is linked.
  let mamaKul: ProfilePrefill['mamaKul'];
  let mamaVillage: string | undefined;
  if (mother?.externalParentId && !mother.externalParentPending) {
    const grandfather = await MemberModel.findById(mother.externalParentId, { familyId: 1 }).lean();
    const maher = grandfather ? await FamilyModel.findById(grandfather.familyId, { gotra: 1, place: 1 }).lean() : null;
    mamaKul = maher?.gotra ?? undefined;
    mamaVillage = maher?.place;
  }

  const district = (await BranchModel.findById(family.branchAncestors[0] ?? family.branchId, { name: 1 }).lean())?.name?.replace(/ District$/, '');
  const [firstName, ...rest] = member.name.trim().split(/\s+/);
  const caller = father ?? head;
  const prefill: ProfilePrefill = {
    firstName,
    surname: rest.at(-1),
    fatherName: father?.name.split(/\s+/)[0],
    education: member.education ?? undefined,
    occupation: member.occupation ?? undefined,
    parentName: caller ? surnameFirst(caller.name) : undefined,
    parentOccupation: father?.occupation ?? undefined,
    parentWorkVillage: family.place,
    motherOccupation: mother?.occupation ?? undefined,
    nativeVillage: family.place,
    nativeDistrict: district,
    mamaKul,
    mamaVillage,
    addressLine: family.address ?? undefined,
    village: family.place,
    district,
    contactName: caller?.name,
    contactPhone: caller?.phone ?? undefined,
    parentWhatsapp: caller?.phone ?? undefined,
    candidateMobile: member.phone ?? undefined,
    ...(parent && {
      siblings: { brothers: brothers.length, brothersMarried: brothers.filter(married).length, sisters: sisters.length, sistersMarried: sisters.filter(married).length },
    }),
  };
  // Leave out what we don't know, so the form keeps its own blanks.
  return Object.fromEntries(Object.entries(prefill).filter(([, v]) => v !== undefined && v !== null && v !== '')) as ProfilePrefill;
}

/** A draft goes to the committee once every required field is filled. */
export async function submitProfile(viewer: Viewer, id: string): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  if (profile.status !== 'draft') throw new AppError(409, 'CONFLICT', 'This profile was already sent.', issue('validation.profileChanged'));
  assertComplete(profile);
  profile.status = 'pending';
  profile.submittedAt = new Date();
  await profile.save();
  return getProfile(viewer, id);
}

export async function updateProfile(viewer: Viewer, id: string, fields: Fields): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  if (profile.status === 'closed') throw new AppError(409, 'CONFLICT', 'This profile is closed.', issue('validation.profileClosed'));
  profile.set(await checkFields(fields, profile.birthYear));
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
  assertComplete(profile);
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
  const plain = profile.toObject();
  const prefs = { ...EMPTY_PREFERENCES, ...plain.preferences };
  const [interest, member, prefBranches, marks] = await Promise.all([
    own ? null : interestWithViewer(viewer, profile),
    MemberModel.findById(profile.memberId, { photoKey: 1, photoVersion: 1 }).lean(),
    prefs.branchIds.length ? BranchModel.find({ _id: { $in: prefs.branchIds } }).lean() : [],
    own ? [] : MarkModel.find({ fromFamilyId: new Types.ObjectId(viewer.familyId), profileId: profile._id }).lean(),
  ]);
  const accepted = interest?.status === 'accepted';
  // The family, the committee reviewing it, and a family whose interest was accepted.
  const showContact = own || canReview || accepted;
  const visibility = plain.incomeVisibility ?? 'accepted';
  const showIncomeBand = own || canReview || visibility === 'everyone' || (visibility === 'accepted' && accepted);
  const monthly = plain.monthlyIncome ?? null;

  const detail: ProfileDetail = {
    ...card,
    surname: plain.surname ?? null,
    firstName: plain.firstName ?? null,
    fatherName: plain.fatherName ?? null,
    diet: plain.diet ?? null,
    hasDisability: plain.hasDisability ?? false,
    disabilityDetail: plain.disabilityDetail ?? null,
    birthDate: plain.birthDate ?? null,
    birthTimeOfDay: plain.birthTimeOfDay ?? null,
    birthTime: plain.birthTime ?? null,
    birthPlace: plain.birthPlace ?? null,
    rashi: plain.rashi ?? null,
    nakshatra: plain.nakshatra ?? null,
    manglik: plain.manglik ?? null,
    educationLevel: plain.educationLevel ?? null,
    otherEducation: plain.otherEducation ?? null,
    employerType: plain.employerType ?? null,
    employerName: plain.employerName ?? null,
    designation: plain.designation ?? null,
    workLocation: plain.workLocation ?? null,
    incomeBand: showIncomeBand && monthly !== null ? incomeBandOf(monthly) : null,
    incomeVisibility: visibility,
    parentName: plain.parentName ?? null,
    parentOccupation: plain.parentOccupation ?? null,
    parentWorkVillage: plain.parentWorkVillage ?? null,
    motherOccupation: plain.motherOccupation ?? null,
    nativeVillage: plain.nativeVillage ?? null,
    nativeDistrict: plain.nativeDistrict ?? null,
    mamaName: plain.mamaName ?? null,
    mamaKul: plain.mamaKul ?? null,
    mamaVillage: plain.mamaVillage ?? null,
    mamaNativeVillage: plain.mamaNativeVillage ?? null,
    mamaNativeDistrict: plain.mamaNativeDistrict ?? null,
    siblings: { ...EMPTY_SIBLINGS, ...plain.siblings },
    about: plain.about ?? null,
    expectations: plain.expectations ?? null,
    prompts: (plain.prompts ?? []).map((p) => ({ prompt: p.prompt, answer: p.answer })),
    marks: marks.map((m) => ({ fromProfileId: String(m.fromProfileId), kind: m.kind })),
    preferences: {
      ageMin: prefs.ageMin ?? null,
      ageMax: prefs.ageMax ?? null,
      heightMinCm: prefs.heightMinCm ?? null,
      maritalStatuses: prefs.maritalStatuses ?? [],
      diets: prefs.diets ?? [],
      branches: prefBranches.map((b) => ({ id: String(b._id), name: b.name, nameMr: b.nameMr })),
    },
    photos: photosOf(profile).map((ph) => ({ id: String(ph._id), url: profilePhotoUrl(profile._id, ph) })),
    familyPhotoUrl: member ? photoUrl(member as Pick<MemberDoc, '_id' | 'photoKey' | 'photoVersion'>) : null,
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
  if (showContact) {
    detail.contact = {
      name: profile.contactName,
      phone: profile.contactPhone,
      candidateMobile: plain.candidateMobile ?? null,
      parentWhatsapp: plain.parentWhatsapp ?? null,
      mamaMobile: plain.mamaMobile ?? null,
      employerAddress: plain.employerAddress ?? null,
      address: { line: plain.addressLine ?? null, village: plain.village ?? null, taluka: plain.taluka ?? null, district: plain.district ?? null, pincode: plain.pincode ?? null },
    };
  }
  if (own || canReview) {
    detail.moderationNote = profile.moderationNote ?? null;
    detail.monthlyIncome = monthly;
    detail.missing = missingFor(profile);
  }
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

type PreferenceLike = Pick<Preferences, 'ageMin' | 'ageMax' | 'heightMinCm'> & {
  maritalStatuses?: readonly string[] | null;
  diets?: readonly string[] | null;
  branchIds?: readonly (string | Types.ObjectId)[] | null;
};
type Scorable = Pick<ProfileDoc, 'birthYear' | 'branchId' | 'branchAncestors'> & {
  heightCm?: number | null;
  maritalStatus?: string | null;
  diet?: string | null;
};

/**
 * How many of a family's stated preferences a profile meets, or null when the
 * family stated none. Unknown details (no height given, say) don't count as met.
 */
export function matchScore(prefs: PreferenceLike, p: Scorable): { met: number; total: number } | null {
  const checks: boolean[] = [];
  const age = ageOf(p.birthYear) ?? 0;
  if (prefs.ageMin != null || prefs.ageMax != null) checks.push((prefs.ageMin == null || age >= prefs.ageMin) && (prefs.ageMax == null || age <= prefs.ageMax));
  if (prefs.heightMinCm != null) checks.push(p.heightCm != null && p.heightCm >= prefs.heightMinCm);
  if (prefs.maritalStatuses?.length) checks.push(p.maritalStatus != null && prefs.maritalStatuses.includes(p.maritalStatus));
  if (prefs.diets?.length) checks.push(p.diet != null && prefs.diets.includes(p.diet));
  if (prefs.branchIds?.length) {
    const wanted = new Set(prefs.branchIds.map(String));
    checks.push(wanted.has(String(p.branchId)) || p.branchAncestors.some((a) => wanted.has(String(a))));
  }
  return checks.length ? { met: checks.filter(Boolean).length, total: checks.length } : null;
}

/**
 * Best-match search ranks the newest MATCH_POOL eligible profiles. Ranking
 * needs every candidate in hand; the pool keeps that bounded, and a family
 * can always narrow the filters or switch to newest first.
 */
export const MATCH_POOL = 500;

const encodeOffset = (n: number) => Buffer.from(JSON.stringify(['o', n])).toString('base64url');
function decodeOffset(cursor: string): number {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed[0] === 'o' && Number.isInteger(parsed[1]) && (parsed[1] as number) >= 0) return parsed[1] as number;
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'The page link is invalid. Reload the list.');
}

/**
 * Search on behalf of one of the viewer's own live profiles: opposite gender,
 * never the same gotra, never the viewer's own family. Best matches for the
 * family's preferences first (newest first among equals), or newest first.
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
  // The gotra rule: neither their gotra nor, for someone adopted, the one they were born into. Profiles whose family hasn't recorded a gotra still appear.
  const mine = gotrasOf(own);
  if (mine.length) conditions.push({ gotra: { $nin: mine } }, { birthGotra: { $nin: mine } });
  // The mama's kul, both ways: never my mama's kul, and never someone whose mama shares my kul.
  if (own.mamaKul) conditions.push({ gotra: { $ne: own.mamaKul } }, { birthGotra: { $ne: own.mamaKul } });
  if (mine.length) conditions.push({ mamaKul: { $nin: mine } });
  if (query.ageMin) conditions.push({ birthYear: { $lte: year - query.ageMin } });
  if (query.ageMax) conditions.push({ birthYear: { $gte: year - query.ageMax } });
  if (query.branchId) {
    conditions.push(inBranch(query.branchId));
  }
  if (query.education) conditions.push({ education: new RegExp(`(^|[\\s.,/(])${escapeRegex(query.education)}`, 'i') });
  if (query.heightMin) conditions.push({ heightCm: { $gte: query.heightMin } });
  if (query.maritalStatus) conditions.push({ maritalStatus: query.maritalStatus });
  if (query.diet) conditions.push({ diet: query.diet });

  // The family's private marks: passed profiles leave the grid, and Discover shows only ones not seen yet.
  const marks = await MarkModel.find({ fromProfileId: own._id }, { profileId: 1, kind: 1 }).lean();
  const markBy = new Map<string, MarkKind>(marks.map((m) => [String(m.profileId), m.kind]));
  const marked = (kind?: MarkKind) => marks.filter((m) => !kind || m.kind === kind).map((m) => m.profileId);
  if (query.view === 'shortlist') conditions.push({ _id: { $in: marked('shortlist') } });
  else if (query.view === 'discover') {
    const interests = await InterestModel.find({ $or: [{ fromProfileId: own._id }, { toProfileId: own._id }] }, { fromProfileId: 1, toProfileId: 1 }).lean();
    const talkedTo = interests.map((i) => (String(i.fromProfileId) === String(own._id) ? i.toProfileId : i.fromProfileId));
    conditions.push({ _id: { $nin: [...marked(), ...talkedTo] } });
  } else if (marked('pass').length) conditions.push({ _id: { $nin: marked('pass') } });

  const base: QueryFilter<ProfileDoc> = { $and: conditions };
  const prefs = { ...EMPTY_PREFERENCES, ...own.toObject().preferences };
  const hasPrefs = matchScore(prefs, own) !== null;
  const withMatch = async (docs: (CardSource & Scorable)[]) => {
    const cards = await toCards(docs);
    const byId = new Map(docs.map((d) => [String(d._id), d]));
    return cards.map((c) => {
      const d = byId.get(c.id);
      const match = hasPrefs && d ? matchScore(prefs, d) : null;
      return { ...c, ...(match && { match }), mark: markBy.get(c.id) ?? null };
    });
  };

  // Discover always shows the best matches first.
  if ((query.sort === 'match' || query.view === 'discover') && hasPrefs) {
    const offset = query.cursor ? decodeOffset(query.cursor) : 0;
    const [pool, total] = await Promise.all([
      ProfileModel.find(base).sort({ activatedAt: -1, _id: -1 }).limit(MATCH_POOL).lean(),
      cappedCount(ProfileModel, base),
    ]);
    // Array.sort is stable, so equal scores stay newest first.
    const ranked = pool
      .map((doc) => ({ doc, met: matchScore(prefs, doc)?.met ?? 0 }))
      .sort((a, b) => b.met - a.met)
      .map((r) => r.doc);
    const items = ranked.slice(offset, offset + query.limit);
    const next = offset + query.limit;
    return { items: await withMatch(items), total, nextCursor: next < ranked.length ? encodeOffset(next) : null };
  }

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
  return { items: await withMatch(items), total, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

/* ---------- Shortlist and pass ---------- */

/**
 * Shortlist or pass on a profile, while searching for one of the family's own
 * profiles; kind null clears the mark. Private to the family.
 */
export async function setMark(viewer: Viewer, fromProfileId: string, profileId: string, kind: MarkKind | null): Promise<{ kind: MarkKind | null }> {
  const from = await loadProfile(fromProfileId);
  if (String(from.familyId) !== viewer.familyId) throw forbidden('Mark profiles for one of your own family’s profiles.');
  const target = await loadProfile(profileId);
  if (!canViewProfile(viewer, target) || String(target.familyId) === viewer.familyId) throw profileGone();
  if (kind === null) {
    await MarkModel.deleteOne({ fromProfileId: from._id, profileId: target._id });
    return { kind: null };
  }
  await MarkModel.updateOne(
    { fromProfileId: from._id, profileId: target._id },
    { $set: { kind, fromFamilyId: from.familyId } },
    { upsert: true },
  );
  return { kind };
}

/* ---------- Photos ---------- */

const photoGone = () => notFound('That photo is no longer available.');

function findPhoto(profile: ProfileDocument, photoId: string): Photo {
  const photo = photosOf(profile).find((ph) => String(ph._id) === photoId);
  if (!photo) throw photoGone();
  return photo;
}

/** Add a photo at the end. The file's first bytes decide its type, not the Content-Type header. */
export async function addPhoto(viewer: Viewer, id: string, data: Buffer): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  if (profile.status === 'closed') throw new AppError(409, 'CONFLICT', 'This profile is closed.', issue('validation.profileClosed'));
  if (photosOf(profile).length >= MAX_PROFILE_PHOTOS) {
    throw new AppError(400, 'VALIDATION_FAILED', `A profile can have up to ${MAX_PROFILE_PHOTOS} photos.`, issue('validation.photoLimit', 'photo'));
  }
  if (data.length > PHOTO_MAX_BYTES) throw new AppError(400, 'VALIDATION_FAILED', 'The photo is too large.', issue('validation.photoSize', 'photo'));
  const type = imageType(data);
  if (!type) throw new AppError(400, 'VALIDATION_FAILED', 'Upload a JPEG, PNG or WebP photo.', issue('validation.photoType', 'photo'));

  const key = `profiles/${String(profile._id)}-${randomBytes(6).toString('hex')}.${type.ext}`;
  await storage.put(key, data);
  profile.photos.push({ key });
  await profile.save();
  return getProfile(viewer, id);
}

export async function removePhoto(viewer: Viewer, id: string, photoId: string): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  const photo = findPhoto(profile, photoId);
  profile.set('photos', photosOf(profile).filter((ph) => ph !== photo));
  await profile.save();
  await storage.remove(photo.key);
  return getProfile(viewer, id);
}

/** Move a photo to the front, where search and the profile show it first. */
export async function makeMainPhoto(viewer: Viewer, id: string, photoId: string): Promise<ProfileDetail> {
  const profile = await loadManageable(viewer, id);
  const photo = findPhoto(profile, photoId);
  profile.set('photos', [photo, ...photosOf(profile).filter((ph) => ph !== photo)]);
  await profile.save();
  return getProfile(viewer, id);
}

/** The photo's bytes, for anyone who may see the profile. */
export async function getPhoto(viewer: Viewer, id: string, photoId: string): Promise<{ data: Buffer; contentType: string }> {
  const profile = await loadProfile(id).catch(() => {
    throw photoGone();
  });
  if (!canViewProfile(viewer, profile)) throw photoGone();
  const photo = findPhoto(profile, photoId);
  const data = await storage.read(photo.key);
  if (!data) throw photoGone();
  return { data, contentType: CONTENT_TYPES[photo.key.split('.').pop() ?? ''] ?? 'application/octet-stream' };
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
  await ProfileModel.updateMany({ birthFamilyId: familyId }, { $set: { birthGotra: gotra } });
}

export async function syncMember(member: Pick<MemberDoc, '_id' | 'gender' | 'birthYear' | 'adopted' | 'birthFamilyId'>) {
  const birth = await birthGotraOf(member);
  // A profile needs a birth year; if it was cleared, keep the last known one.
  await ProfileModel.updateOne({ memberId: member._id }, { $set: { gender: member.gender, ...(member.birthYear && { birthYear: member.birthYear }), ...birth } });
}

/** An adopted person's birth family and its gotra, kept on their profile for the gotra rule. */
async function birthGotraOf(member: Pick<MemberDoc, 'adopted' | 'birthFamilyId'>) {
  const birthFamilyId = member.adopted && member.birthFamilyId ? member.birthFamilyId : null;
  const family = birthFamilyId ? await FamilyModel.findById(birthFamilyId, { gotra: 1 }).lean() : null;
  return { birthFamilyId: family ? birthFamilyId : null, birthGotra: family?.gotra ?? null };
}

/** Gotras a profile keeps matches away from: the family's, and for someone adopted, their birth family's. */
export const gotrasOf = (p: { gotra?: GotraId | null; birthGotra?: GotraId | null }) => [p.gotra, p.birthGotra].filter((g): g is GotraId => Boolean(g));

type KulHolder = { gotra?: GotraId | null; birthGotra?: GotraId | null; mamaKul?: GotraId | null };

/**
 * Whether two profiles may not be matched because of kul: the same kul, or
 * either one's kul is the other's maternal uncle's kul. Search and interests
 * both use this rule.
 */
export function kulClash(a: KulHolder, b: KulHolder): 'same' | 'mama' | null {
  const ka = gotrasOf(a);
  const kb = gotrasOf(b);
  if (ka.some((g) => kb.includes(g))) return 'same';
  if ((a.mamaKul && kb.includes(a.mamaKul)) || (b.mamaKul && ka.includes(b.mamaKul))) return 'mama';
  return null;
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
  await MarkModel.deleteMany({ $or: [{ fromProfileId: profile._id }, { profileId: profile._id }] });
  await Promise.all(photosOf(profile).map((ph) => storage.remove(ph.key)));
}
