import { z } from 'zod';
import type { Gender } from '../constants';
import { GOTRA_IDS, type GotraId } from '../gotras';
import { NAKSHATRA_IDS, type NakshatraId, RASHI_IDS, type RashiId } from '../horoscope';
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
export const ELIGIBLE_RELATIONS = ['son', 'daughter', 'brother', 'sister', 'nephew', 'niece', 'grandson', 'granddaughter', 'greatGrandson', 'greatGranddaughter', 'other'] as const;

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

export const MARITAL_STATUSES = ['neverMarried', 'divorced', 'widowed'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const DIETS = ['vegetarian', 'eggetarian', 'nonVegetarian'] as const;
export type Diet = (typeof DIETS)[number];

/** Photos a profile may have besides the person's family photo. */
export const MAX_PROFILE_PHOTOS = 4;

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

/** A count typed into a form: blank is "not given". */
const optionalCount = (max: number) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v)))
    .pipe(z.number({ error: 'validation.count' }).int('validation.count').min(0, 'validation.count').max(max, 'validation.count').nullable());

/** 1994-08-21. The API also checks the year against the person's birth year. */
const birthDateSchema = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.birthDate')
      .refine((v) => !Number.isNaN(Date.parse(v)) && Date.parse(v) <= Date.now(), 'validation.birthDate')
      .nullable(),
  );

/** 24-hour time of birth, 06:45, for horoscope matching. */
const birthTimeSchema = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.birthTime').nullable());

/** Brothers and sisters, and how many of each are married. */
export const siblingsSchema = z
  .object({
    brothers: optionalCount(15),
    brothersMarried: optionalCount(15),
    sisters: optionalCount(15),
    sistersMarried: optionalCount(15),
  })
  .superRefine((v, ctx) => {
    if (v.brothersMarried !== null && (v.brothers ?? 0) < v.brothersMarried) ctx.addIssue({ code: 'custom', path: ['brothersMarried'], message: 'validation.marriedCount' });
    if (v.sistersMarried !== null && (v.sisters ?? 0) < v.sistersMarried) ctx.addIssue({ code: 'custom', path: ['sistersMarried'], message: 'validation.marriedCount' });
  });
export type Siblings = z.output<typeof siblingsSchema>;

const optionalAge = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v)))
  .pipe(z.number({ error: 'validation.prefAge' }).int('validation.prefAge').min(18, 'validation.prefAge').max(80, 'validation.prefAge').nullable());

/** A multi-choice preference: an empty list means "any". */
const choiceList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values, { error: 'validation.choose' }))
    .max(values.length)
    .nullish()
    .transform((v) => [...new Set(v ?? [])]);

/**
 * What the family looks for. Every part is optional; search counts how many of
 * the given ones a profile meets and shows the best matches first.
 */
export const preferencesSchema = z
  .object({
    ageMin: optionalAge,
    ageMax: optionalAge,
    heightMinCm: heightSchema,
    maritalStatuses: choiceList(MARITAL_STATUSES),
    diets: choiceList(DIETS),
    /** Districts, cities or towns; a branch includes everything inside it. */
    branchIds: z
      .array(objectIdSchema)
      .max(10)
      .nullish()
      .transform((v) => [...new Set(v ?? [])]),
  })
  .superRefine((v, ctx) => {
    if (v.ageMin !== null && v.ageMax !== null && v.ageMin > v.ageMax) ctx.addIssue({ code: 'custom', path: ['ageMax'], message: 'validation.prefAgeRange' });
  });
export type PreferencesInput = z.input<typeof preferencesSchema>;
export type Preferences = z.output<typeof preferencesSchema>;

export const EMPTY_SIBLINGS: Siblings = { brothers: null, brothersMarried: null, sisters: null, sistersMarried: null };
export const EMPTY_PREFERENCES: Preferences = { ageMin: null, ageMax: null, heightMinCm: null, maritalStatuses: [], diets: [], branchIds: [] };

/** The fields a family writes. Name, gender and birth year come from the family member record. */
export const profileFieldsSchema = z.object({
  // Personal
  heightCm: heightSchema,
  maritalStatus: optionalEnum(MARITAL_STATUSES),
  diet: optionalEnum(DIETS),
  // Birth and horoscope
  birthDate: birthDateSchema,
  birthTime: birthTimeSchema,
  birthPlace: optionalText(80),
  rashi: optionalEnum(RASHI_IDS),
  nakshatra: optionalEnum(NAKSHATRA_IDS),
  manglik: optionalEnum(MANGLIK),
  maternalGotra: optionalEnum(GOTRA_IDS),
  // Education and work
  education: optionalText(120),
  occupation: optionalText(120),
  workLocation: optionalText(80),
  income: optionalEnum(INCOME_RANGES),
  // Family
  fatherOccupation: optionalText(80),
  motherOccupation: optionalText(80),
  nativePlace: optionalText(80),
  siblings: siblingsSchema.nullish().transform((v) => v ?? EMPTY_SIBLINGS),
  // In their words
  about: optionalText(600),
  expectations: optionalText(600),
  preferences: preferencesSchema.nullish().transform((v) => v ?? EMPTY_PREFERENCES),
  // Contact
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

export const SEARCH_SORTS = ['match', 'newest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const profileSearchSchema = z.object({
  forProfile: objectIdSchema,
  /** Best matches for the family's preferences first, or the newest profiles first. */
  sort: z.enum(SEARCH_SORTS).default('match'),
  ageMin: z.coerce.number().int().min(18).max(80).optional(),
  ageMax: z.coerce.number().int().min(18).max(80).optional(),
  heightMin: z.coerce.number().int().min(120).max(220).optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).optional(),
  diet: z.enum(DIETS).optional(),
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
  /** The first profile photo, or the person's family photo. */
  photoUrl: string | null;
  maritalStatus: MaritalStatus | null;
  status: ProfileStatus;
  /** In search results: how many of the searching family's preferences this profile meets. */
  match?: { met: number; total: number };
}

export interface ProfilePreferences extends Omit<Preferences, 'branchIds'> {
  branches: { id: string; name: string; nameMr: string }[];
}

export interface ProfilePhoto {
  id: string;
  url: string;
}

export interface ProfileDetail extends ProfileCard {
  diet: Diet | null;
  birthDate: string | null;
  birthTime: string | null;
  birthPlace: string | null;
  rashi: RashiId | null;
  nakshatra: NakshatraId | null;
  manglik: Manglik | null;
  maternalGotra: GotraId | null;
  workLocation: string | null;
  income: IncomeRange | null;
  fatherOccupation: string | null;
  motherOccupation: string | null;
  nativePlace: string | null;
  siblings: Siblings;
  about: string | null;
  expectations: string | null;
  preferences: ProfilePreferences;
  /** Profile photos, in order. The first is the main one. */
  photos: ProfilePhoto[];
  /** The person's photo from the family page, used when the profile has none of its own. */
  familyPhotoUrl: string | null;
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
