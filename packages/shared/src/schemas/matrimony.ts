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

/** 'draft': saved by the family but not yet sent to the committee (details may still be missing). */
export const PROFILE_STATUSES = ['draft', 'pending', 'active', 'rejected', 'paused', 'closed'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

/** Why a profile was closed: the family found a match, withdrew it, or the committee removed it. */
export const CLOSE_REASONS = ['married', 'withdrawn', 'removed'] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

/** Monthly income is stored exactly; other families only ever see one of these bands. */
export const INCOME_BANDS = ['below15', '15to25', '25to50', '50to100', 'above100'] as const;
export type IncomeBand = (typeof INCOME_BANDS)[number];

export function incomeBandOf(monthly: number): IncomeBand {
  if (monthly < 15_000) return 'below15';
  if (monthly < 25_000) return '15to25';
  if (monthly < 50_000) return '25to50';
  if (monthly < 100_000) return '50to100';
  return 'above100';
}

/** Who sees the income band: anyone who can see the profile, only a family whose interest was accepted, or nobody. */
export const INCOME_VISIBILITY = ['everyone', 'accepted', 'hidden'] as const;
export type IncomeVisibility = (typeof INCOME_VISIBILITY)[number];

/** The time-of-birth bands on the samaj form. The exact time is optional, for kundli matching. */
export const BIRTH_TIMES_OF_DAY = ['pahate', 'sakal', 'dupar', 'sandhya', 'ratra'] as const;
export type BirthTimeOfDay = (typeof BIRTH_TIMES_OF_DAY)[number];

/** The band an exact time falls in: pahate 3–6, sakal 6–12, dupar 12–4, sandhya 4–8, ratra 8–3. */
export function timeOfDayOf(hhmm: string): BirthTimeOfDay {
  const hour = Number(hhmm.slice(0, 2));
  if (hour >= 3 && hour < 6) return 'pahate';
  if (hour >= 6 && hour < 12) return 'sakal';
  if (hour >= 12 && hour < 16) return 'dupar';
  if (hour >= 16 && hour < 20) return 'sandhya';
  return 'ratra';
}

/** Main education. 'other' covers anyone without a diploma or degree (12th pass, for example). */
export const EDUCATION_LEVELS = ['master', 'bachelor', 'diploma', 'other'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export const EMPLOYER_TYPES = ['private', 'government', 'selfEmployed'] as const;
export type EmployerType = (typeof EMPLOYER_TYPES)[number];

export const MANGLIK = ['yes', 'no', 'dontKnow'] as const;
export type Manglik = (typeof MANGLIK)[number];

export const MARITAL_STATUSES = ['neverMarried', 'divorced', 'widowed'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const DIETS = ['vegetarian', 'eggetarian', 'nonVegetarian'] as const;
export type Diet = (typeof DIETS)[number];

/**
 * Short prompts a family can answer, shown as cards between the photos. The
 * question text lives in the web dictionary; the database stores the id.
 */
export const PROMPT_IDS = ['ourFamily', 'perfectWeekend', 'iValue', 'proudOf', 'afterMarriage', 'favouriteThings'] as const;
export type PromptId = (typeof PROMPT_IDS)[number];
export const MAX_PROMPTS = 3;

/** A family's private note on another profile: saved for later, or not for us. The other family never sees it. */
export const MARK_KINDS = ['shortlist', 'pass'] as const;
export type MarkKind = (typeof MARK_KINDS)[number];

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

const optionalPhone = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(phoneSchema.nullable());

const pincodeSchema = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.replace(/\s/g, '') : '') || null)
  .pipe(z.string().regex(/^[1-9]\d{5}$/, 'validation.pincode').nullable());

const monthlyIncomeSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || String(v).trim() === '' ? null : Number(String(v).replace(/[,\s₹]/g, ''))))
  .pipe(z.number({ error: 'validation.income' }).int('validation.income').min(0, 'validation.income').max(10_000_000, 'validation.income').nullable());

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

/**
 * The fields a family writes, following the samaj's vadhu-var form. Gender
 * and birth year come from the family member record, and kul (gotra) from
 * the family. Everything may be left blank in a draft; profileMissingFields
 * says what must be filled before the committee sees it.
 */
export const profileFieldsSchema = z.object({
  // Identity, as written on the form: surname, given name, father's name
  surname: optionalText(40),
  firstName: optionalText(40),
  fatherName: optionalText(40),
  // Personal
  heightCm: heightSchema,
  maritalStatus: optionalEnum(MARITAL_STATUSES),
  diet: optionalEnum(DIETS),
  hasDisability: z.boolean().nullish().transform((v) => v ?? false),
  disabilityDetail: optionalText(200),
  // Birth and horoscope
  birthDate: birthDateSchema,
  birthTimeOfDay: optionalEnum(BIRTH_TIMES_OF_DAY),
  birthTime: birthTimeSchema,
  birthPlace: optionalText(80),
  rashi: optionalEnum(RASHI_IDS),
  nakshatra: optionalEnum(NAKSHATRA_IDS),
  manglik: optionalEnum(MANGLIK),
  // Education and work
  educationLevel: optionalEnum(EDUCATION_LEVELS),
  /** The degree itself: B.E. Mechanical. */
  education: optionalText(120),
  otherEducation: optionalText(120),
  occupation: optionalText(120),
  employerType: optionalEnum(EMPLOYER_TYPES),
  employerName: optionalText(120),
  employerAddress: optionalText(200),
  designation: optionalText(80),
  workLocation: optionalText(80),
  monthlyIncome: monthlyIncomeSchema,
  incomeVisibility: z.enum(INCOME_VISIBILITY, { error: 'validation.choose' }).nullish().transform((v) => v ?? 'accepted'),
  // Parent (the guardian filling the form) and family
  parentName: optionalText(80),
  parentOccupation: optionalText(80),
  parentWorkVillage: optionalText(80),
  motherOccupation: optionalText(80),
  nativeVillage: optionalText(80),
  nativeDistrict: optionalText(60),
  siblings: siblingsSchema.nullish().transform((v) => v ?? EMPTY_SIBLINGS),
  // Maternal uncle (mama). His kul matters for matching, not just courtesy.
  mamaName: optionalText(80),
  mamaKul: optionalEnum(GOTRA_IDS),
  mamaVillage: optionalText(80),
  mamaNativeVillage: optionalText(80),
  mamaNativeDistrict: optionalText(60),
  mamaMobile: optionalPhone,
  // Residential address
  addressLine: optionalText(200),
  village: optionalText(80),
  taluka: optionalText(60),
  district: optionalText(60),
  pincode: pincodeSchema,
  // In their words
  about: optionalText(600),
  expectations: optionalText(600),
  /** Up to three prompt answers, each prompt once. */
  prompts: z
    .array(z.object({ prompt: z.enum(PROMPT_IDS, { error: 'validation.choose' }), answer: z.string().trim().min(3, 'validation.promptAnswer').max(200, 'validation.tooLong') }))
    .max(MAX_PROMPTS, 'validation.promptLimit')
    .nullish()
    .transform((v) => (v ?? []).filter((item, i, all) => all.findIndex((x) => x.prompt === item.prompt) === i)),
  preferences: preferencesSchema.nullish().transform((v) => v ?? EMPTY_PREFERENCES),
  // Contact: the family's mobile, the candidate's own, and the parent's WhatsApp the samaj writes to
  contactName: personNameSchema,
  contactPhone: phoneSchema,
  candidateMobile: optionalPhone,
  parentWhatsapp: optionalPhone,
});
export type ProfileFieldsInput = z.input<typeof profileFieldsSchema>;
export type ProfileFields = z.output<typeof profileFieldsSchema>;

export const profileCreateSchema = profileFieldsSchema.extend({
  memberId: objectIdSchema,
  consent: z.literal(true, { error: 'validation.consent' }),
  /** Send to the committee straight away (every required field filled), or keep as a draft. */
  submit: z.boolean().nullish().transform((v) => v ?? false),
});

/**
 * The form's required fields, in form order. A profile can be saved without
 * them, but can't go to the committee or a melava until they are filled.
 */
export const REQUIRED_FOR_REVIEW = [
  'surname',
  'firstName',
  'fatherName',
  'heightCm',
  'maritalStatus',
  'manglik',
  'birthDate',
  'birthTimeOfDay',
  'birthPlace',
  'educationLevel',
  'education',
  'occupation',
  'employerType',
  'monthlyIncome',
  'parentName',
  'nativeVillage',
  'nativeDistrict',
  'mamaName',
  'mamaKul',
  'addressLine',
  'village',
  'taluka',
  'district',
  'pincode',
  'candidateMobile',
  'parentWhatsapp',
] as const satisfies readonly (keyof ProfileFields)[];

/** A field that is missing, or 'gotra' when the family page has no kul yet, or 'disabilityDetail' when ticked but not described. */
export type MissingField = (typeof REQUIRED_FOR_REVIEW)[number] | 'gotra' | 'disabilityDetail';

/** What still has to be filled before the profile can be sent for approval or registered for a melava. */
export function profileMissingFields(
  p: Partial<Record<(typeof REQUIRED_FOR_REVIEW)[number], unknown>> & { birthTime?: string | null; hasDisability?: boolean | null; disabilityDetail?: string | null },
  familyGotra: string | null,
): MissingField[] {
  const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  const missing: MissingField[] = REQUIRED_FOR_REVIEW.filter((key) => {
    // An exact time is as good as a band.
    if (key === 'birthTimeOfDay') return blank(p.birthTimeOfDay) && blank(p.birthTime);
    return blank(p[key]);
  });
  if (p.hasDisability && blank(p.disabilityDetail)) missing.push('disabilityDetail');
  if (!familyGotra) missing.unshift('gotra');
  return missing;
}
export type ProfileCreateInput = z.input<typeof profileCreateSchema>;

export const closeProfileSchema = z.object({ reason: z.enum(['married', 'withdrawn'], { error: 'validation.choose' }) });

export const moderationReasonSchema = z.object({
  reason: z.string().trim().min(5, 'validation.reasonMin').max(300, 'validation.tooLong'),
});

export const SEARCH_SORTS = ['match', 'newest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

/**
 * all: every eligible profile, minus the ones the family passed on.
 * discover: only profiles the family hasn't marked or sent interest to, best matches first.
 * shortlist: the family's shortlist.
 */
export const SEARCH_VIEWS = ['all', 'discover', 'shortlist'] as const;
export type SearchView = (typeof SEARCH_VIEWS)[number];

export const profileSearchSchema = z.object({
  forProfile: objectIdSchema,
  view: z.enum(SEARCH_VIEWS).default('all'),
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

/** Shortlist or pass on a profile, for one of the family's own profiles; null clears it. */
export const markSchema = z.object({
  fromProfileId: objectIdSchema,
  profileId: objectIdSchema,
  kind: z.enum(MARK_KINDS).nullable(),
});
export type MarkInput = z.input<typeof markSchema>;

/**
 * What the family page already says about someone, to start their profile
 * with: names, parents, siblings, places and phones. Every field is only a
 * suggestion; the form fills the empty ones.
 */
export type ProfilePrefill = Partial<{
  surname: string;
  firstName: string;
  fatherName: string;
  education: string;
  occupation: string;
  parentName: string;
  parentOccupation: string;
  parentWorkVillage: string;
  motherOccupation: string;
  nativeVillage: string;
  nativeDistrict: string;
  mamaKul: GotraId;
  mamaVillage: string;
  addressLine: string;
  village: string;
  district: string;
  contactName: string;
  contactPhone: string;
  candidateMobile: string;
  parentWhatsapp: string;
  siblings: { brothers: number; brothersMarried: number; sisters: number; sistersMarried: number };
}>;

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
  /** In search results: the searching family's own mark on it. */
  mark?: MarkKind | null;
}

export interface ProfilePreferences extends Omit<Preferences, 'branchIds'> {
  branches: { id: string; name: string; nameMr: string }[];
}

export interface ProfilePhoto {
  id: string;
  url: string;
}

export interface ProfileDetail extends ProfileCard {
  surname: string | null;
  firstName: string | null;
  fatherName: string | null;
  diet: Diet | null;
  hasDisability: boolean;
  disabilityDetail: string | null;
  birthDate: string | null;
  birthTimeOfDay: BirthTimeOfDay | null;
  birthTime: string | null;
  birthPlace: string | null;
  rashi: RashiId | null;
  nakshatra: NakshatraId | null;
  manglik: Manglik | null;
  educationLevel: EducationLevel | null;
  otherEducation: string | null;
  employerType: EmployerType | null;
  employerName: string | null;
  designation: string | null;
  workLocation: string | null;
  /** The exact amount: only for the family itself and the committee. */
  monthlyIncome?: number | null;
  /** The band, when the family's visibility choice lets this viewer see it. */
  incomeBand: IncomeBand | null;
  incomeVisibility: IncomeVisibility;
  parentName: string | null;
  parentOccupation: string | null;
  parentWorkVillage: string | null;
  motherOccupation: string | null;
  nativeVillage: string | null;
  nativeDistrict: string | null;
  mamaName: string | null;
  mamaKul: GotraId | null;
  mamaVillage: string | null;
  mamaNativeVillage: string | null;
  mamaNativeDistrict: string | null;
  siblings: Siblings;
  about: string | null;
  expectations: string | null;
  prompts: { prompt: PromptId; answer: string }[];
  /** The viewer family's marks on this profile, one per own profile that made one. */
  marks: { fromProfileId: string; kind: MarkKind }[];
  preferences: ProfilePreferences;
  /** Profile photos, in order. The first is the main one. */
  photos: ProfilePhoto[];
  /** The person's photo from the family page, used when the profile has none of its own. */
  familyPhotoUrl: string | null;
  /** Present only to the profile's own family, the committee, and after an accepted interest. */
  contact?: {
    name: string;
    phone: string;
    candidateMobile: string | null;
    parentWhatsapp: string | null;
    mamaMobile: string | null;
    employerAddress: string | null;
    address: { line: string | null; village: string | null; taluka: string | null; district: string | null; pincode: string | null };
  };
  /** For the family and the committee: what still has to be filled before approval. */
  missing?: MissingField[];
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
