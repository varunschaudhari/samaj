import { z } from 'zod';
import { objectIdSchema } from './common';
import type { LinkedFamily } from './links';

/*
 * A family's own invitations: a wedding with its functions, a मुंज, a
 * दशक्रिया. Sent household to household (सहकुटुंब), to families picked from
 * the host's family tree, their linked families and the directory. Guests
 * answer each function with a headcount; the host sees the tally.
 */

export const INVITATION_KINDS = [
  'wedding',
  'engagement',
  'munj',
  'naming',
  'babyShower',
  'housewarming',
  'birthday',
  'shashtyabdi',
  'dashakriya',
  'uttarkarya',
  'shraddha',
  'varshashraddha',
  'other',
] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

/** In memory of someone: a quiet card, and "will attend" rather than a celebration. */
export const REMEMBRANCE_KINDS: readonly InvitationKind[] = ['dashakriya', 'uttarkarya', 'shraddha', 'varshashraddha'];

export const RSVP_ANSWERS = ['yes', 'maybe', 'no'] as const;
export type RsvpAnswer = (typeof RSVP_ANSWERS)[number];

/** Families one invitation can go to. */
export const MAX_INVITATION_GUESTS = 300;
/** Families one family can invite in a day, across its invitations: a guard against spam. */
export const DAILY_INVITATION_GUESTS = 600;
export const MAX_INVITATION_FUNCTIONS = 6;
export const MAX_INVITATION_PEOPLE = 30;
/** The family's own printed patrika, scanned or as its PDF. */
export const PATRIKA_MAX_BYTES = 5 * 1024 * 1024;
export const PATRIKA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

/** An uploaded patrika: a picture shown on the page, or a PDF to open. */
export interface PatrikaView {
  kind: 'image' | 'pdf';
  /** Changes with each upload, so the file's URL can be cached. */
  version: number;
}

const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
    .pipe(z.string().max(max, 'validation.tooLong').nullable());

const mapUrlSchema = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(z.url({ protocol: /^https$/, error: 'validation.mapUrl' }).nullable());

const isoDate = z.iso.datetime({ offset: true, error: 'validation.eventDate' });

/** One function of an invitation: हळद on Friday evening, लग्न on Saturday morning. */
export const invitationFunctionSchema = z
  .object({
    /** Kept when editing, so answers stay with their function. */
    id: z.string().max(40).optional(),
    name: z.string().trim().min(2, 'validation.functionName').max(60, 'validation.tooLong'),
    startsAt: isoDate,
    endsAt: isoDate.nullish().transform((v) => v ?? null),
    venue: z.string().trim().min(2, 'validation.venue').max(200, 'validation.tooLong'),
    mapUrl: mapUrlSchema,
    /** शुभमुहूर्त: the auspicious moment itself, often not when the function starts. */
    muhuratAt: isoDate.nullish().transform((v) => v ?? null),
  })
  .superRefine((f, ctx) => {
    if (f.endsAt && new Date(f.endsAt) <= new Date(f.startsAt)) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'validation.eventEnd' });
    // Within a day of the function: a muhurat on the wrong date is a typing slip.
    if (f.muhuratAt && Math.abs(new Date(f.muhuratAt).getTime() - new Date(f.startsAt).getTime()) > 86_400_000) {
      ctx.addIssue({ code: 'custom', path: ['muhuratAt'], message: 'validation.muhurat' });
    }
  });

/** Names listed on the patrika: कृपाछत्र, आशीर्वाद, निमंत्रक. */
export const MAX_PATRIKA_NAMES = 12;
const nameList = z
  .array(z.string().trim().max(80, 'validation.tooLong'))
  .max(MAX_PATRIKA_NAMES, 'validation.tooManyNames')
  .default([])
  .transform((names) => names.filter(Boolean));

/** Whose occasion, as a patrika prints it: the name, and whose child they are and from where. */
export const honoreeSchema = z.object({
  name: z.string().trim().min(2, 'validation.nameMin').max(80, 'validation.nameMax'),
  detail: optionalText(160),
});

export const invitationInputSchema = z.object({
  kind: z.enum(INVITATION_KINDS, { error: 'validation.choose' }),
  /** Whose occasion: "Rohit & Kavya", "Aarav", "Late Ramrao Wagh". */
  forNames: optionalText(120),
  message: optionalText(1000),
  /** The bride and groom, the child, the one remembered: up to two, shown in place of forNames. */
  honorees: z.array(honoreeSchema).max(2).default([]),
  /** Elders who have passed away, whose grace the family invokes (कृपाछत्र). */
  kripa: nameList,
  /** Living elders whose blessings the family asks (आशीर्वाद). */
  blessings: nameList,
  /** Who invites (निमंत्रक). */
  inviters: nameList,
  /** For a remembrance: the family member remembered, whose photo the card shows. */
  memorialMemberId: objectIdSchema.nullish().transform((v) => v ?? null),
  functions: z.array(invitationFunctionSchema).min(1, 'validation.functionsNeeded').max(MAX_INVITATION_FUNCTIONS, 'validation.tooManyFunctions'),
});
export type InvitationInput = z.input<typeof invitationInputSchema>;

const guestIds = z
  .array(objectIdSchema)
  .min(1, 'validation.guestsNeeded')
  .max(MAX_INVITATION_GUESTS, 'validation.tooManyGuests')
  .transform((ids) => [...new Set(ids)]);

export const createInvitationSchema = invitationInputSchema.extend({
  guestFamilyIds: guestIds,
  /** Families picked from the tree or linked families; any others count as picked from the directory. */
  treeFamilyIds: z.array(objectIdSchema).max(MAX_INVITATION_GUESTS).default([]),
  linkedFamilyIds: z.array(objectIdSchema).max(MAX_INVITATION_GUESTS).default([]),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

export const addGuestsSchema = z.object({
  guestFamilyIds: guestIds,
  treeFamilyIds: z.array(objectIdSchema).max(MAX_INVITATION_GUESTS).default([]),
  linkedFamilyIds: z.array(objectIdSchema).max(MAX_INVITATION_GUESTS).default([]),
});

export const invitationRsvpSchema = z.object({
  answers: z
    .array(
      z.object({
        functionId: z.string().min(1).max(40),
        answer: z.enum(RSVP_ANSWERS),
        people: z.coerce.number().int().min(0).max(MAX_INVITATION_PEOPLE, 'validation.rsvpPeople'),
        /** Of those coming, how many are children: for the meal count. */
        children: z.coerce.number().int().min(0).max(MAX_INVITATION_PEOPLE).default(0),
      }).refine((a) => a.children <= a.people, { path: ['children'], message: 'validation.rsvpChildren' }),
    )
    .min(1)
    .max(MAX_INVITATION_FUNCTIONS),
  /** People needing a place to stay, for families coming from out of town; 0 for none. */
  stay: z.coerce.number().int().min(0).max(MAX_INVITATION_PEOPLE, 'validation.rsvpPeople').default(0),
});
export type InvitationRsvpInput = z.input<typeof invitationRsvpSchema>;

/** Replies through an invitation's link, from people not on the app. */
export const MAX_LINK_REPLIES = 500;

/** A reply through the link: who is answering (typed, not checked) and their answers. */
export const linkReplySchema = invitationRsvpSchema.extend({
  name: z.string().trim().min(2, 'validation.replyName').max(80, 'validation.tooLong'),
  place: optionalText(60),
  /** Given back with the first reply, so the same phone can change its answer. */
  key: z.string().min(16).max(64).optional(),
});
export type LinkReplyInput = z.input<typeof linkReplySchema>;

export interface InvitationFunction {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  mapUrl: string | null;
  muhuratAt: string | null;
}

export interface Honoree {
  name: string;
  detail: string | null;
}

/** Everything a printed patrika carries beyond the functions. */
export interface PatrikaText {
  honorees: Honoree[];
  kripa: string[];
  blessings: string[];
  inviters: string[];
  /** The one remembered: their name, years and, when they have one, photo version. */
  memorial: { memberId: string; name: string; years: string | null; photoVersion: number | null } | null;
}

export interface InvitationAnswer {
  functionId: string;
  answer: RsvpAnswer;
  people: number;
  children: number;
}

/** How a guest family came to be invited: from the host's family tree, their linked families, or picked from the directory. */
export const GUEST_VIAS = ['tree', 'linked', 'picked'] as const;
export type GuestVia = (typeof GUEST_VIAS)[number];

export interface InvitationSummary {
  id: string;
  kind: InvitationKind;
  forNames: string | null;
  host: LinkedFamily;
  firstAt: string;
  lastAt: string;
  functionCount: number;
  cancelled: boolean;
  /** Past its last function, or cancelled: no more answers. */
  closed: boolean;
  /** For a guest: whether their family has answered. */
  answered?: boolean;
  /** For a guest: the host changed a time or venue after they answered. */
  changedSinceAnswer?: boolean;
  /** For the host. */
  invitedCount?: number;
  repliedCount?: number;
}

export interface InvitationGuestView {
  family: LinkedFamily;
  via: GuestVia;
  answers: InvitationAnswer[];
  stay: number;
  respondedByName: string | null;
  respondedAt: string | null;
}

/** Someone not on the app who replied through the link. */
export interface LinkReplyView {
  id: string;
  name: string;
  place: string | null;
  answers: InvitationAnswer[];
  stay: number;
  respondedAt: string;
}

export interface InvitationDetail extends InvitationSummary, PatrikaText {
  message: string | null;
  sentByName: string;
  functions: InvitationFunction[];
  isHost: boolean;
  /** For a guest: their family's answers. */
  mine?: { answers: InvitationAnswer[]; stay: number; respondedByName: string | null; respondedAt: string | null };
  /** For the host: every guest family and the headcount per function. */
  guests?: InvitationGuestView[];
  tally?: { functionId: string; yes: number; maybe: number; no: number; people: number; children: number }[];
  /** For the host: replies needing a place to stay, and how many people. */
  stayTally?: { replies: number; people: number };
  /** For the host: the secret part of the link anyone can open, or null when the link is off. */
  shareToken?: string | null;
  linkReplies?: LinkReplyView[];
  patrika: PatrikaView | null;
}

/** What the link shows: the card, and nothing about who else was invited. */
export interface PublicInvitation extends PatrikaText {
  kind: InvitationKind;
  forNames: string | null;
  message: string | null;
  hostName: string;
  functions: InvitationFunction[];
  cancelled: boolean;
  closed: boolean;
  patrika: PatrikaView | null;
}

/** A link reply as its sender sees it, with the key to change it later. */
export interface LinkReplyReceipt {
  key: string;
  name: string;
  place: string | null;
  answers: InvitationAnswer[];
  stay: number;
}

/** How a tree family is related: the family's own homes, a married-in woman's माहेर, व्याही, other relatives. */
export const AUDIENCE_GROUPS = ['family', 'maher', 'inLaws', 'relatives'] as const;
export type AudienceGroup = (typeof AUDIENCE_GROUPS)[number];

export interface AudienceFamily extends LinkedFamily {
  group: AudienceGroup;
  /** For a माहेर: whose (the woman who married in). */
  through: string | null;
}

/** An earlier invitation's guests, to invite the same families again. */
export interface EarlierGuestList {
  id: string;
  kind: InvitationKind;
  forNames: string | null;
  firstAt: string;
  families: LinkedFamily[];
}

/** Families the host can pick from: their family tree, linked families and earlier guest lists. */
export interface InvitationAudience {
  tree: AudienceFamily[];
  linked: LinkedFamily[];
  earlier: EarlierGuestList[];
  /** How many more families this family can invite today. */
  leftToday: number;
}

/** A function coming up soon that the family is going to, or hosting: for "Tomorrow: हळद at 5 pm" on Home. */
export interface UpcomingFunction {
  invitationId: string;
  kind: InvitationKind;
  forNames: string | null;
  hostName: string;
  hosting: boolean;
  name: string;
  startsAt: string;
  venue: string;
}

export interface MyInvitations {
  invited: InvitationSummary[];
  hosting: InvitationSummary[];
  /** Functions in the next day and a half the family said it would attend (or maybe), or is hosting. */
  upcoming: UpcomingFunction[];
  /** Families whose invitations this family chose not to see. */
  hidden: LinkedFamily[];
  /** The viewer's family may send invitations (verified). */
  canHost: boolean;
}
