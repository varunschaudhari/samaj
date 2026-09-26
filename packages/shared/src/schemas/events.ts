import { z } from 'zod';
import { objectIdSchema } from './common';

/*
 * Events reach the same audience as notices: families in the event's branch
 * and every town under it. RSVP is per family, as a headcount.
 */

export const MAX_RSVP_PEOPLE = 30;

const optionalText = (max: number) =>
  z
    .string()
    .nullish()
    .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
    .pipe(z.string().max(max, 'validation.tooLong').nullable());

/** A map link people can tap. Only https, so nobody can slip in a javascript: link. */
const mapUrlSchema = z
  .string()
  .nullish()
  .transform((v) => (typeof v === 'string' ? v.trim() : '') || null)
  .pipe(z.url({ protocol: /^https$/, error: 'validation.mapUrl' }).nullable());

const isoDate = z.iso.datetime({ offset: true, error: 'validation.eventDate' });

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(3, 'validation.noticeTitle').max(120, 'validation.tooLong'),
    description: optionalText(3000),
    startsAt: isoDate,
    endsAt: isoDate.nullish().transform((v) => v ?? null),
    venue: z.string().trim().min(2, 'validation.venue').max(200, 'validation.tooLong'),
    mapUrl: mapUrlSchema,
    branchId: objectIdSchema,
    rsvpEnabled: z.boolean().default(true),
  })
  .superRefine((e, ctx) => {
    if (e.endsAt && new Date(e.endsAt) <= new Date(e.startsAt)) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'validation.eventEnd' });
    }
  });
export type EventInput = z.input<typeof eventInputSchema>;

export const eventListQuerySchema = z.object({
  when: z.enum(['upcoming', 'past']).default('upcoming'),
});

export const rsvpSchema = z.object({
  /** 0 means "not coming" and clears the family's RSVP. */
  people: z.coerce.number().int().min(0).max(MAX_RSVP_PEOPLE, 'validation.rsvpPeople'),
});

export interface EventSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  branch: { id: string; name: string; nameMr: string };
  rsvpEnabled: boolean;
  /** People coming, across all families. */
  headcount: number;
  families: number;
  /** How many from the viewer's family are coming, 0 if none. */
  myPeople: number;
}

export interface EventDetail extends EventSummary {
  description: string | null;
  mapUrl: string | null;
  createdByName: string;
  permissions: { canEdit: boolean };
  /** Only for the organising committee. */
  attendees?: { familyId: string; headName: string; place: string; people: number }[];
}
