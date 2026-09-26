import { z } from 'zod';
import type { Gender } from '../constants';
import { GOTRA_IDS, type GotraId } from '../gotras';
import { objectIdSchema, phoneSchema } from './common';
import { personNameSchema } from './auth';

/*
 * Matrimonial profiles. The rules, in one place:
 *  - Only verified families create profiles, for their own members, with the person's consent.
 *  - The branch committee approves each profile before anyone else sees it.
 *  - Photos are visible to members of verified families; contact details only after both
 *    families accept an interest.
 *  - Search is always for one of your own active profiles: opposite gender, different gotra,
 *    never your own family.
 *  - Marking a profile married closes it for good and withdraws its open interests.
 */

/**
 * Relations that can have a profile. Spouses, parents and in-laws are already
 * married. A head of family qualifies only when the family has no spouse listed.
 */
export const ELIGIBLE_RELATIONS = ['son', 'daughter', 'brother', 'sister', 'grandson', 'granddaughter', 'other'] as const;

/** Legal minimum marriage age in India. */
export const MIN_MARRIAGE_AGE: Record<Gender, number> = { male: 21, female: 18, other: 18 };

export const PROFILE_STATUSES = ['pending', 'active', 'rejected', 'paused', 'closed'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** Why a profile was closed: the family found a match, withdrew it, or the committee removed it. */
export const CLOSE_REASONS = ['married', 'withdrawn', 'removed'] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

export const INCOME_RANGES = ['below3', '3to6', '6to10', '10to20', 'above20'] as const;
export type IncomeRange = (typeof INCOME_RANGES)[number];

export const MANGLIK = ['yes', 'no', 'dontKnow'] as const;
export type Manglik = (typeof MANGLIK)[number];

export const INTEREST_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn'] as const;
export type InterestStatus = (typeof INTEREST_STATUSES)[number];

/** Pending interests one profile may have out at a time, so nobody sends to everyone. */
export const MAX_PENDING_SENT = 20;

const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
    .pipe(z.string().max(max, 'validation.tooLong').nullable());

/** Blank select means "not given". */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .nullish()
    .transform((v) => v || null)
    .pipe(z.enum(values, { error: 'validation.choose' }).nullable());

const heightSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v)))
  .pipe(z.number({ error: 'validation.height' }).int('validation.height').min(120, 'validation.height').max(220, 'validation.height').nullable());

/** The fields a family writes. Name, gender and birth year come from the family member record. */
export const profileFieldsSchema = z.object({
  heightCm: heightSchema,
  education: optionalText(120),
  occupation: optionalText(120),
  income: optionalEnum(INCOME_RANGES),
  manglik: optionalEnum(MANGLIK),
  maternalGotra: optionalEnum(GOTRA_IDS),
  about: optionalText(600),
  expectations: optionalText(600),
  contactName: personNameSchema,
  contactPhone: phoneSchema,
});
export type ProfileFieldsInput = z.input<typeof profileFieldsSchema>;

export const profileCreateSchema = profileFieldsSchema.extend({
  memberId: objectIdSchema,
  consent: z.literal(true, { error: 'validation.consent' }),
});
export type ProfileCreateInput = z.input<typeof profileCreateSchema>;

export const closeProfileSchema = z.object({ reason: z.enum(['married', 'withdrawn'], { error: 'validation.choose' }) });

export const moderationReasonSchema = z.object({
  reason: z.string().trim().min(5, 'validation.reasonMin').max(300, 'validation.tooLong'),
});

export const profileSearchSchema = z.object({
  forProfile: objectIdSchema,
  ageMin: z.coerce.number().int().min(18).max(80).optional(),
  ageMax: z.coerce.number().int().min(18).max(80).optional(),
  branchId: objectIdSchema.optional(),
  education: z.string().trim().max(60).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProfileSearchQuery = z.input<typeof profileSearchSchema>;

export const sendInterestSchema = z.object({ fromProfileId: objectIdSchema, toProfileId: objectIdSchema });

/** A profile as it appears in search results and lists. */
export interface ProfileCard {
  id: string;
  memberId: string;
  familyId: string;
  name: string;
  gender: Gender;
  age: number | null;
  gotra: GotraId | null;
  heightCm: number | null;
  education: string | null;
  occupation: string | null;
  place: string;
  branch: { id: string; name: string; nameMr: string };
  photoUrl: string | null;
  status: ProfileStatus;
}

export interface ProfileDetail extends ProfileCard {
  income: IncomeRange | null;
  manglik: Manglik | null;
  maternalGotra: GotraId | null;
  about: string | null;
  expectations: string | null;
  /** Present only to the profile's own family and after an accepted interest. */
  contact?: { name: string; phone: string };
  closeReason: CloseReason | null;
  /** The committee's note when rejecting or removing. Shown to the family and reviewers only. */
  moderationNote?: string | null;
  permissions: {
    canEdit: boolean;
    canReview: boolean;
  };
  /** Interest between this profile and the viewer's family's profiles, if any. */
  interest?: InterestSummary | null;
}

export interface InterestSummary {
  id: string;
  status: InterestStatus;
  /** true when the viewer's family sent it. */
  sentByViewer: boolean;
  fromProfileId: string;
  toProfileId: string;
}

export interface InterestItem extends InterestSummary {
  /** The profile on the other side. */
  other: ProfileCard;
  /** The viewer's own profile involved. */
  own: { id: string; name: string };
  createdAt: string;
  contact?: { name: string; phone: string };
}

export interface MyMatrimony {
  profiles: (ProfileCard & { closeReason: CloseReason | null; moderationNote: string | null })[];
  /** Family members who may get a profile: old enough, with a birth year, and without one already. */
  eligible: { memberId: string; name: string; gender: Gender; age: number }[];
  /** Members left out, and why, so the family knows what to fix. */
  ineligible: { memberId: string; name: string; reason: 'noBirthYear' | 'tooYoung' }[];
}

export interface ProfilePage {
  items: ProfileCard[];
  nextCursor: string | null;
  total: number;
}
