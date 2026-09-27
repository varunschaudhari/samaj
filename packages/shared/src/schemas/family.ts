import { z } from 'zod';
import type { FamilyLinkView, LinkedFamily } from './links';
import type { PhoneVisibility } from './privacy';
import { type FamilyStatus, type Gender, GENDERS } from '../constants';
import { personNameSchema } from './auth';
import { GOTRA_IDS, type GotraId } from '../gotras';
import { objectIdSchema, phoneSchema } from './common';

/** Relation to the family head. Exactly one member of a family is the head. */
export const RELATIONS = [
  'head',
  'spouse',
  'son',
  'daughter',
  'father',
  'mother',
  'grandfather',
  'grandmother',
  'greatGrandfather',
  'greatGrandmother',
  'uncle',
  'aunt',
  'paternalAunt',
  'maternalUncle',
  'maternalUncleWife',
  'maternalAunt',
  'brother',
  'sister',
  'sisterInLaw',
  'daughterInLaw',
  'sonInLaw',
  'nephew',
  'niece',
  'grandson',
  'granddaughter',
  'granddaughterInLaw',
  'grandsonInLaw',
  'greatGrandson',
  'greatGranddaughter',
  'other',
] as const;
export type Relation = (typeof RELATIONS)[number];

/** The family's own children and grandchildren: their parents are in the family. Anyone else's may be in another one. */
export const CHILD_RELATIONS: readonly Relation[] = ['son', 'daughter', 'grandson', 'granddaughter', 'greatGrandson', 'greatGranddaughter', 'nephew', 'niece'];

/** Someone who married into the family: they stand beside whoever they married. */
export const SPOUSE_RELATIONS: readonly Relation[] = [
  'spouse',
  'mother',
  'grandmother',
  'greatGrandmother',
  'aunt',
  'maternalUncleWife',
  'sisterInLaw',
  'daughterInLaw',
  'sonInLaw',
  'granddaughterInLaw',
  'grandsonInLaw',
];

/** Relations someone can be adopted into (दत्तक). Only the family and its committee see that they were. */
export const ADOPTABLE_RELATIONS: readonly Relation[] = ['son', 'daughter', 'grandson', 'granddaughter', 'greatGrandson', 'greatGranddaughter', 'nephew', 'niece'];

/**
 * Whose child someone is, where the relation to the head doesn't say: which
 * son a grandchild belongs to, which brother a nephew. The family picks from
 * the people with these relations; with only one of them, it is that one.
 */
export const PARENT_CHOICES: Partial<Record<Relation, readonly Relation[]>> = {
  grandson: ['son', 'daughter'],
  granddaughter: ['son', 'daughter'],
  greatGrandson: ['grandson', 'granddaughter'],
  greatGranddaughter: ['grandson', 'granddaughter'],
  nephew: ['brother', 'sister'],
  niece: ['brother', 'sister'],
};

/** Whose wife or husband someone who married into the family is. */
export const PARTNER_CHOICES: Partial<Record<Relation, readonly Relation[]>> = {
  daughterInLaw: ['son'],
  sonInLaw: ['daughter'],
  sisterInLaw: ['brother'],
  aunt: ['uncle'],
  maternalUncleWife: ['maternalUncle'],
  granddaughterInLaw: ['grandson'],
  grandsonInLaw: ['granddaughter'],
};

/** 'invited': someone was given a code to their own sign-in; 'joined': they used it. */
export const HISTORY_ACTIONS = [
  'created',
  'updated',
  'verified',
  'rejected',
  'resubmitted',
  'invited',
  'joined',
  // A person the family added was approved or turned down by the committee.
  'memberApproved',
  'memberRejected',
  // Links with other families, and people moving between families.
  'linked',
  'unlinked',
  'movedIn',
  'movedOut',
] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

export const MEMBER_APPROVALS = ['approved', 'pending'] as const;
export type MemberApproval = (typeof MEMBER_APPROVALS)[number];

/*
 * These schemas are idempotent: their output is valid input. The web form
 * parses, then sends the parsed values, and the API parses them again.
 */

/** Optional free text: blank becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
    .pipe(z.string().max(max, 'validation.tooLong').nullable());

const optionalPhone = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(phoneSchema.nullable());

/** A four-digit year, blank for unknown. Early enough for great-grandparents. */
const yearSchema = (message: string) =>
  z
    .union([z.string(), z.number()])
    .nullish()
    .transform((v) => {
      if (v === null || v === undefined) return null;
      const text = String(v).trim();
      return text === '' ? null : Number(text);
    })
    .pipe(z.number({ error: message }).int(message).min(1800, message).max(new Date().getFullYear(), message).nullable());

export const birthYearSchema = yearSchema('validation.birthYear');

const optionalId = z
  .union([z.literal(''), objectIdSchema])
  .nullish()
  .transform((v) => v || null);

const memberFields = z.object({
  name: personNameSchema,
  relation: z.enum(RELATIONS, { error: 'validation.relation' }),
  gender: z.enum(GENDERS, { error: 'validation.gender' }),
  birthYear: birthYearSchema,
  occupation: optionalText(60),
  education: optionalText(60),
  phone: optionalPhone,
  /** Kept in the family and its tree, out of the directory, matrimony and sign-ins. */
  deceased: z.boolean().default(false),
  deathYear: yearSchema('validation.deathYear'),
  /** See PARENT_CHOICES and PARTNER_CHOICES; blank when the relation says it all. */
  parentId: optionalId,
  partnerId: optionalId,
  adopted: z.boolean().default(false),
  /** A child's other parent, when their parent has had more than one spouse (a second marriage). */
  otherParentId: optionalId,
  /** Divorced or separated from whoever they married. Widowed is simply their partner having passed away. */
  formerPartner: z.boolean().default(false),
  /** For someone adopted: the family they were born into, if it is in the directory. Its gotra counts for matrimony too. */
  birthFamilyId: optionalId,
});

type MemberFields = z.output<typeof memberFields>;

function checkYears(v: MemberFields, ctx: z.RefinementCtx) {
  if (v.deceased && v.deathYear !== null && v.birthYear !== null && v.deathYear < v.birthYear) {
    ctx.addIssue({ code: 'custom', path: ['deathYear'], message: 'validation.deathBeforeBirth' });
  }
}

/** Drop what doesn't apply: a number for someone who has passed away, ties the relation doesn't take. */
const tidy = <T extends MemberFields>(v: T): T => ({
  ...v,
  phone: v.deceased ? null : v.phone,
  deathYear: v.deceased ? v.deathYear : null,
  parentId: PARENT_CHOICES[v.relation] ? v.parentId : null,
  partnerId: PARTNER_CHOICES[v.relation] ? v.partnerId : null,
  adopted: v.adopted && ADOPTABLE_RELATIONS.includes(v.relation),
  otherParentId: CHILD_RELATIONS.includes(v.relation) ? v.otherParentId : null,
  formerPartner: v.formerPartner && SPOUSE_RELATIONS.includes(v.relation),
  birthFamilyId: v.adopted && ADOPTABLE_RELATIONS.includes(v.relation) ? v.birthFamilyId : null,
});

export const memberInputSchema = memberFields.superRefine(checkYears).transform(tidy);
export type MemberInput = z.input<typeof memberInputSchema>;
export type MemberInputParsed = z.output<typeof memberInputSchema>;

/**
 * Adding someone: the person adding them confirms that person agrees to be
 * listed or, for anyone under 18, that they are their parent or guardian.
 * Not asked for someone who has passed away.
 */
export const memberCreateSchema = memberFields
  .extend({ consent: z.boolean().optional() })
  .superRefine((v, ctx) => {
    checkYears(v, ctx);
    if (!v.deceased && v.consent !== true) ctx.addIssue({ code: 'custom', path: ['consent'], message: 'validation.consentRequired' });
  })
  .transform(tidy);
export type MemberCreateInput = z.input<typeof memberCreateSchema>;

/** One of the fixed gotras, or blank (null) for "not listed / not sure". */
export const gotraSchema = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(z.enum(GOTRA_IDS, { error: 'validation.gotra' }).nullable());

export const familyUpdateSchema = z.object({
  place: z.string().trim().min(2, 'validation.placeMin').max(60, 'validation.tooLong'),
  gotra: gotraSchema,
  address: optionalText(200),
});
export type FamilyUpdateInput = z.input<typeof familyUpdateSchema>;

/**
 * A committee member or admin registers a family on its behalf, for households
 * without a smartphone or at an enrolment camp. The head needs no account; a
 * blank place becomes the branch name.
 */
export const enrolFamilySchema = z.object({
  branchId: objectIdSchema,
  place: optionalText(60).pipe(z.string().min(2, 'validation.placeMin').nullable()),
  gotra: gotraSchema,
  address: optionalText(200),
  head: memberFields.omit({ relation: true, deceased: true, deathYear: true, parentId: true, partnerId: true, adopted: true, otherParentId: true, formerPartner: true, birthFamilyId: true }),
  /** The committee confirms the family agreed to be registered. */
  consent: z.literal(true, { error: 'validation.consentRequired' }),
});
export type EnrolFamilyInput = z.input<typeof enrolFamilySchema>;

export const rejectFamilySchema = z.object({
  reason: z.string().trim().min(5, 'validation.reasonMin').max(300, 'validation.tooLong'),
});
export type RejectFamilyInput = z.input<typeof rejectFamilySchema>;

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export interface FamilyMember {
  id: string;
  name: string;
  relation: Relation;
  gender: Gender;
  birthYear: number | null;
  occupation: string | null;
  education: string | null;
  /** Present only when the viewer may see this family's contact details. */
  phone?: string | null;
  photoUrl: string | null;
  isHead: boolean;
  /** The member signs in with their own account; they can't be removed from the family here. */
  hasAccount: boolean;
  /** The viewer may create a password reset code for this member's account. */
  canResetPassword: boolean;
  /** The member's account id, present only when canResetPassword is true. */
  accountId?: string;
  /** The viewer may create an invite code so this person can sign in to this family. */
  canInvite: boolean;
  /** 'pending': added to a verified family and waiting for the committee; only the family and reviewers see them. */
  approval: MemberApproval;
  /** Present for the family and committee: who else sees this person's phone, and whether they're in the directory. */
  privacy?: { phoneVisibility: PhoneVisibility; listed: boolean };
  /** The viewer may change those: the person themselves, or the family for people without an account. */
  canEditPrivacy: boolean;
  /** They moved in from another family (their माहेर, after a marriage). */
  movedFrom?: LinkedFamily;
  /** Passed away: shown as "Late" (कै.) in the family and its tree only. */
  deceased: boolean;
  deathYear: number | null;
  /** Whose child they are, when the family said (grandchildren, nephews, nieces). Null: worked out from the relation. */
  parentId: string | null;
  /** Whose wife or husband they are, for someone who married in, when the family said. */
  partnerId: string | null;
  /** Adopted into the family. Present for the family and its committee only. */
  adopted?: boolean;
  /** Their parent, listed in another family (a head's father in his parents' home, a wife's father in her माहेर). */
  externalParent?: { id: string; name: string; family: LinkedFamily };
  /** Their other parent, when their parent has had more than one spouse. */
  otherParentId: string | null;
  /** Divorced or separated from whoever they married. */
  formerPartner: boolean;
  /** Adopted: the family they were born into. For the family and its committee only, like adoption itself. */
  birthFamily?: LinkedFamily;
}

/** Someone who was in this family and moved to another, usually after marriage. */
export interface MovedOutMember {
  memberId: string;
  name: string;
  /** Their relation here, before they moved. */
  relation: Relation | null;
  gender: Gender;
  /** The family they are in now. */
  family: LinkedFamily;
  at: string;
}

/** A one-time code that links a new sign-in to a person already listed in a family. */
export interface InviteCode {
  code: string;
  expiresAt: string;
}

export interface FamilyHistoryEntry {
  at: string;
  action: HistoryAction;
  byName: string;
  note: string | null;
}

export interface FamilyDetail {
  id: string;
  status: FamilyStatus;
  rejectionReason: string | null;
  headName: string;
  place: string;
  gotra: GotraId | null;
  /** Present only when the viewer may see contact details. */
  address?: string | null;
  branch: { id: string; name: string; nameMr: string };
  members: FamilyMember[];
  /** Present only for the family itself and reviewers. */
  history?: FamilyHistoryEntry[];
  createdAt: string;
  permissions: {
    canEdit: boolean;
    canReview: boolean;
    canResubmit: boolean;
    /** The viewer's own family may propose a link to this one. */
    canLink: boolean;
    /** The viewer's own family may ask for people from this one to move in. */
    canRequestMove: boolean;
  };
  /** Accepted links to other families. */
  links: FamilyLinkView[];
  /** People who moved from this family to another, newest first. */
  movedOut: MovedOutMember[];
}

export interface PendingFamily {
  id: string;
  headName: string;
  place: string;
  branch: { id: string; name: string; nameMr: string };
  memberCount: number;
  submittedAt: string;
}

export interface PendingFamilyPage {
  items: PendingFamily[];
  nextCursor: string | null;
  total: number;
}
