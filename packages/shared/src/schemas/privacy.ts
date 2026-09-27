import { z } from 'zod';

/*
 * Privacy and consent (India's Digital Personal Data Protection Act, 2023).
 *
 *  - Everyone agrees to the current privacy notice: at signup or joining, or
 *    once on their next sign-in when the notice changes. Until they do, the
 *    API answers only the privacy and sign-out routes.
 *  - Whoever lists another person confirms that person agrees, or, for
 *    someone under 18, that they are the parent or guardian.
 *  - Each person chooses who sees their phone number, and whether they are
 *    listed in the directory at all.
 *  - Anyone can download their data, and delete it: themselves, or (a head
 *    who is the family's only account) the whole family. Deletion waits
 *    DELETION_GRACE_DAYS so it can be cancelled, then everything is erased.
 */

/** Bump when the notice changes in substance; everyone then agrees again. */
export const PRIVACY_NOTICE_VERSION = '2026-09-27';

export const DELETION_GRACE_DAYS = 7;

/** Who, besides the person's own family and their branch committee, sees their phone number. */
export const PHONE_VISIBILITIES = ['committee', 'branch', 'members'] as const;
export type PhoneVisibility = (typeof PHONE_VISIBILITIES)[number];

export const consentField = z.literal(true, { error: 'validation.consentRequired' });

export const consentSchema = z.object({
  version: z.literal(PRIVACY_NOTICE_VERSION, { error: 'validation.consentOutdated' }),
  accept: consentField,
});
export type ConsentInput = z.input<typeof consentSchema>;

export const memberPrivacySchema = z.object({
  phoneVisibility: z.enum(PHONE_VISIBILITIES, { error: 'validation.choose' }),
  /** false: shown only to the family and its committee, not in the directory or to other families. */
  listed: z.boolean(),
});
export type MemberPrivacyInput = z.input<typeof memberPrivacySchema>;

export const DELETION_SCOPES = ['self', 'family'] as const;
export type DeletionScope = (typeof DELETION_SCOPES)[number];

export const deletionRequestSchema = z.object({
  scope: z.enum(DELETION_SCOPES, { error: 'validation.choose' }),
  /** Asked again, so a phone left signed in can't be used to erase someone. */
  password: z.string().min(1, 'validation.passwordRequired').max(128, 'validation.passwordMax'),
});
export type DeletionRequestInput = z.input<typeof deletionRequestSchema>;

/** What the signed-in person's privacy screen shows. */
export interface PrivacyStatus {
  noticeVersion: string;
  consentedAt: string | null;
  phoneVisibility: PhoneVisibility;
  listed: boolean;
  /** Which deletions this person may ask for, and why not when they can't. */
  canDeleteSelf: boolean;
  canDeleteFamily: boolean;
  deleteSelfBlockedBy: 'isHead' | 'lastSuperadmin' | null;
  deleteFamilyBlockedBy: 'notHead' | 'otherAccounts' | null;
  deletion: { scope: DeletionScope; dueAt: string } | null;
}

/** Public: who to contact about privacy. Set in the API's environment. */
export interface PrivacyInfo {
  version: string;
  contact: { name: string | null; email: string | null; phone: string | null };
}
