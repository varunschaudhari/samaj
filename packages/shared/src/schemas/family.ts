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
  'brother',
  'sister',
  'daughterInLaw',
  'sonInLaw',
  'grandson',
  'granddaughter',
  'other',
] as const;
export type Relation = (typeof RELATIONS)[number];

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

export const birthYearSchema = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const text = String(v).trim();
    return text === '' ? null : Number(text);
  })
  .pipe(
    z
      .number({ error: 'validation.birthYear' })
      .int('validation.birthYear')
      .min(1900, 'validation.birthYear')
      .max(new Date().getFullYear(), 'validation.birthYear')
      .nullable(),
  );

export const memberInputSchema = z.object({
  name: personNameSchema,
  relation: z.enum(RELATIONS, { error: 'validation.relation' }),
  gender: z.enum(GENDERS, { error: 'validation.gender' }),
  birthYear: birthYearSchema,
  occupation: optionalText(60),
  education: optionalText(60),
  phone: optionalPhone,
});
export type MemberInput = z.input<typeof memberInputSchema>;
export type MemberInputParsed = z.output<typeof memberInputSchema>;

/**
 * Adding someone: the person adding them confirms that person agrees to be
 * listed or, for anyone under 18, that they are their parent or guardian.
 */
export const memberCreateSchema = memberInputSchema.extend({ consent: z.literal(true, { error: 'validation.consentRequired' }) });
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
  head: memberInputSchema.omit({ relation: true }),
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
