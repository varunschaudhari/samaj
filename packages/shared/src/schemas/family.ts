import { z } from 'zod';
import { type FamilyStatus, type Gender, GENDERS } from '../constants';
import { personNameSchema } from './auth';
import { GOTRA_IDS, type GotraId } from '../gotras';
import { phoneSchema } from './common';

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



export const HISTORY_ACTIONS = ['created', 'updated', 'verified', 'rejected', 'resubmitted'] as const;
export type HistoryAction = (typeof HISTORY_ACTIONS)[number];

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
  };
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
