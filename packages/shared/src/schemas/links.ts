import { z } from 'zod';
import { objectIdSchema } from './common';
import { RELATIONS, type Relation } from './family';

/*
 * How families connect, and how a person moves between them.
 *
 *  - Family links: one family proposes ("this is my parents' family"), the
 *    other accepts. Accepted links show to anyone who can see the family.
 *    Either side can remove one.
 *  - Moving a person (usually after marriage): the new family asks, the old
 *    family agrees, then the new family's branch committee approves. The
 *    person keeps their account; an open matrimony profile closes.
 *  - Someone added to an already verified family waits for the committee
 *    before they show in the directory. Additions by the committee don't.
 */

/** What the other family is to this one. Stored from the proposing family's side; the other side sees the inverse. */
export const LINK_KINDS = ['parents', 'children', 'siblings', 'inLaws', 'relatives'] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export const INVERSE_LINK: Record<LinkKind, LinkKind> = {
  parents: 'children',
  children: 'parents',
  siblings: 'siblings',
  inLaws: 'inLaws',
  relatives: 'relatives',
};

/** A family has at most this many links, accepted or waiting. */
export const MAX_FAMILY_LINKS = 30;

export const linkRequestSchema = z.object({
  toFamilyId: objectIdSchema,
  kind: z.enum(LINK_KINDS, { error: 'validation.choose' }),
});
export type LinkRequestInput = z.input<typeof linkRequestSchema>;

/** Someone joining this family from another: their relation here, and an optional note for the other family and committee. */
export const moveRequestSchema = z.object({
  memberId: objectIdSchema,
  relation: z.enum(RELATIONS.filter((r) => r !== 'head') as [Exclude<Relation, 'head'>, ...Exclude<Relation, 'head'>[]], { error: 'validation.relation' }),
  note: z
    .string()
    .trim()
    .max(300, 'validation.tooLong')
    .nullish()
    .transform((v) => v || null),
});
export type MoveRequestInput = z.input<typeof moveRequestSchema>;

export const declineSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(300, 'validation.tooLong')
    .nullish()
    .transform((v) => v || null),
});
export type DeclineInput = z.input<typeof declineSchema>;

export const rejectMemberSchema = z.object({
  reason: z.string().trim().min(3, 'validation.reasonMin').max(300, 'validation.tooLong'),
});
export type RejectMemberInput = z.input<typeof rejectMemberSchema>;

/** The other family, as a link or request shows it. */
export interface LinkedFamily {
  id: string;
  headName: string;
  place: string;
  branch: { id: string; name: string; nameMr: string };
  /** The viewer may open that family's page. */
  canView: boolean;
}

/** An accepted link, from the point of view of the family whose page shows it. */
export interface FamilyLinkView {
  id: string;
  kind: LinkKind;
  family: LinkedFamily;
  canRemove: boolean;
}

export const MOVE_STATUSES = ['awaitingFamily', 'awaitingCommittee', 'done', 'declined', 'cancelled'] as const;
export type MoveStatus = (typeof MOVE_STATUSES)[number];

export interface MemberMoveView {
  id: string;
  member: { id: string; name: string };
  from: LinkedFamily;
  to: LinkedFamily;
  relation: Relation;
  note: string | null;
  status: MoveStatus;
  requestedByName: string;
  agreedByName: string | null;
  declineReason: string | null;
  createdAt: string;
}

/** What waits for this family: links others proposed, links it proposed, and people moving in or out. */
export interface FamilyRequests {
  incomingLinks: { id: string; kind: LinkKind; family: LinkedFamily; requestedByName: string; createdAt: string }[];
  outgoingLinks: { id: string; kind: LinkKind; family: LinkedFamily; createdAt: string }[];
  /** People another family asked to move out of this one, waiting for this family to agree. */
  movesOut: MemberMoveView[];
  /** People this family asked to move in, until the committee decides. */
  movesIn: MemberMoveView[];
}

/** Someone added to a verified family, waiting for the committee. */
export interface PendingMember {
  id: string;
  name: string;
  relation: Relation;
  birthYear: number | null;
  family: LinkedFamily;
  addedByName: string;
  addedAt: string;
}
