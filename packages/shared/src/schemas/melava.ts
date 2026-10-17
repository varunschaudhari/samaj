import { z } from 'zod';
import { objectIdSchema } from './common';
import type { MissingField, ProfileCard, ProfileStatus } from './matrimony';

/*
 * Melava: a vadhu-var parichay melava, an event where families introduce
 * candidates. Families register a complete, approved-or-waiting profile and
 * pay the fee; the organising committee checks the payment and only then
 * gives the candidate a number (वधू 1, 2… and वर 1, 2…). Organisers download
 * the verified list for the printed booklet.
 */

export const CANDIDATE_TYPES = ['bride', 'groom'] as const;
export type CandidateType = (typeof CANDIDATE_TYPES)[number];

export const REGISTRATION_STATUSES = ['pendingPayment', 'verified', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
    .pipe(z.string().max(max, 'validation.tooLong').nullable());

export const melavaInputSchema = z.object({
  name: z.string().trim().min(3, 'validation.melavaName').max(120, 'validation.tooLong'),
  /** The day of the melava, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.eventDate'),
  venue: optionalText(200),
  /** The organising branch: its committee (and admins) run the melava. */
  branchId: objectIdSchema,
  /** Registration fee in rupees. */
  fee: z.coerce.number({ error: 'validation.fee' }).int('validation.fee').min(0, 'validation.fee').max(100_000, 'validation.fee'),
  /** How to pay: UPI ID, bank details, or the office address. */
  paymentInstructions: optionalText(500),
  registrationOpen: z.boolean().default(true),
});
export type MelavaInput = z.input<typeof melavaInputSchema>;

export const melavaRegisterSchema = z.object({
  profileId: objectIdSchema,
  /** UPI transaction ID, receipt number or similar, so the office can find the payment. */
  paymentRef: z.string().trim().min(3, 'validation.paymentRef').max(60, 'validation.tooLong'),
});
export type MelavaRegisterInput = z.input<typeof melavaRegisterSchema>;

/**
 * The office registers a walk-in family's profile at the counter. paid: the
 * fee was taken there and then, so the number is given at once.
 */
export const melavaOfficeRegisterSchema = z.object({
  profileId: objectIdSchema,
  paid: z.boolean().default(true),
  /** Receipt or UPI reference; blank for cash without a receipt. */
  paymentRef: optionalText(60),
});
export type MelavaOfficeRegisterInput = z.input<typeof melavaOfficeRegisterSchema>;

export const melavaOfficeSearchSchema = z.object({
  /** A name, or a 10-digit mobile number. */
  q: z.string().trim().min(2, 'validation.searchMin').max(60, 'validation.tooLong'),
});

/** A person the office found: whether they can have a profile, the profile if any, and its registration for this melava. */
export interface OfficeCandidate {
  memberId: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  age: number | null;
  familyId: string;
  familyHead: string;
  place: string;
  /** Can have a profile but has none yet. */
  canCreateProfile: boolean;
  /** Who the family would like to be called, to prefill a new profile. */
  suggestedContact: { name: string; phone: string | null };
  profile: { id: string; status: ProfileStatus; missing: MissingField[] } | null;
  registration: { id: string; status: RegistrationStatus; candidateNumber: number | null } | null;
}

export const melavaCancelSchema = z.object({
  reason: z.string().trim().min(3, 'validation.reasonMin').max(200, 'validation.tooLong'),
});

export interface Melava {
  id: string;
  name: string;
  date: string;
  venue: string | null;
  branch: { id: string; name: string; nameMr: string };
  fee: number;
  paymentInstructions: string | null;
  registrationOpen: boolean;
  /** Verified registrations so far. */
  counts: { bride: number; groom: number };
  permissions: { canManage: boolean };
}

export interface MelavaRegistration {
  id: string;
  melavaId: string;
  status: RegistrationStatus;
  candidateType: CandidateType;
  /** Given by the office once the payment is verified. */
  candidateNumber: number | null;
  paymentRef: string;
  cancelReason: string | null;
  profile: ProfileCard;
  createdAt: string;
  verifiedAt: string | null;
}

export interface MelavaDetail extends Melava {
  /** The viewer's family's registrations for this melava. */
  mine: MelavaRegistration[];
  /** Everyone's, for organisers only. */
  registrations?: MelavaRegistration[];
}
