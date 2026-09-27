import { z } from 'zod';
import type { Gender } from '../constants';
import { objectIdSchema } from './common';
import { PARENT_CHOICES, PARTNER_CHOICES, RELATIONS, type Relation } from './family';

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

const optionalId = z
  .union([z.literal(''), objectIdSchema])
  .nullish()
  .transform((v) => v || null);

/**
 * Someone joining this family from another: their relation here, whose wife
 * (or child) they will be where the relation leaves it open, and an
 * optional note for the other family and committee.
 */
export const moveRequestSchema = z
  .object({
    memberId: objectIdSchema,
    relation: z.enum(RELATIONS.filter((r) => r !== 'head') as [Exclude<Relation, 'head'>, ...Exclude<Relation, 'head'>[]], { error: 'validation.relation' }),
    parentId: optionalId,
    partnerId: optionalId,
    note: z
      .string()
      .trim()
      .max(300, 'validation.tooLong')
      .nullish()
      .transform((v) => v || null),
  })
  .transform((v) => ({ ...v, parentId: PARENT_CHOICES[v.relation] ? v.parentId : null, partnerId: PARTNER_CHOICES[v.relation] ? v.partnerId : null }));
export type MoveRequestInput = z.input<typeof moveRequestSchema>;

/** Someone's parent is listed in another family, one linked to theirs. Null clears it. */
export const externalParentSchema = z.object({ memberId: objectIdSchema.nullable() });
export type ExternalParentInput = z.input<typeof externalParentSchema>;

/** Two entries the tree should show as one person, or never merge. */
export const samePersonSchema = z
  .object({ a: objectIdSchema, b: objectIdSchema, same: z.boolean() })
  .refine((v) => v.a !== v.b, { path: ['b'], message: 'validation.samePersonSelf' });
export type SamePersonInput = z.input<typeof samePersonSchema>;

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
  /** Whose wife or child they will be in the new family, when the asking family said. */
  tie: { kind: 'parent' | 'partner'; name: string } | null;
  note: string | null;
  status: MoveStatus;
  requestedByName: string;
  agreedByName: string | null;
  declineReason: string | null;
  createdAt: string;
}

/** What waits for this family: links others proposed, links it proposed, and people moving in or out. */
/** "Anil in your family is Rohit's father": one family's word about a person in another, until that family agrees. */
export interface ParentLinkRequest {
  memberId: string;
  memberName: string;
  parent: { id: string; name: string };
  /** The other family: the child's, for a request to this family; the parent's, for one this family sent. */
  family: LinkedFamily;
  requestedByName: string;
}

export interface FamilyRequests {
  incomingLinks: { id: string; kind: LinkKind; family: LinkedFamily; requestedByName: string; createdAt: string }[];
  outgoingLinks: { id: string; kind: LinkKind; family: LinkedFamily; createdAt: string }[];
  /** People another family asked to move out of this one, waiting for this family to agree. */
  movesOut: MemberMoveView[];
  /** People this family asked to move in, until the committee decides. */
  movesIn: MemberMoveView[];
  /** Another family says one of this family's people is the parent of one of theirs. */
  parentLinksIn: ParentLinkRequest[];
  /** This family said so about someone in another family, which hasn't agreed yet. */
  parentLinksOut: ParentLinkRequest[];
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

/*
 * The family tree: households joined by parents / children / siblings
 * links, laid out by generation. A person's generation is their family
 * head's generation plus their relation's offset (a son is one below the
 * head, a father one above).
 */

/** Generations above (negative) or below the head, by relation to the head. */
export const RELATION_GENERATION: Record<Relation, number> = {
  greatGrandfather: -3,
  greatGrandmother: -3,
  grandfather: -2,
  grandmother: -2,
  father: -1,
  mother: -1,
  uncle: -1,
  aunt: -1,
  paternalAunt: -1,
  maternalUncle: -1,
  maternalUncleWife: -1,
  maternalAunt: -1,
  head: 0,
  spouse: 0,
  brother: 0,
  sister: 0,
  sisterInLaw: 0,
  other: 0,
  son: 1,
  daughter: 1,
  daughterInLaw: 1,
  sonInLaw: 1,
  nephew: 1,
  niece: 1,
  grandson: 2,
  granddaughter: 2,
  granddaughterInLaw: 2,
  grandsonInLaw: 2,
  greatGrandson: 3,
  greatGranddaughter: 3,
};

/** How far the tree reaches above and below the family it's drawn for, and how many households it holds. */
export const TREE_DEPTH = 3;
export const TREE_MAX_HOUSEHOLDS = 30;

export interface TreePerson {
  id: string;
  name: string;
  relation: Relation;
  gender: Gender;
  birthYear: number | null;
  photoUrl: string | null;
  isHead: boolean;
  /** Relative to the head of the family the tree is drawn for: -1 parents, 0 their own, 1 children. */
  generation: number;
  /** They moved out, usually by marriage, and are in this family now. */
  movedTo?: LinkedFamily;
  deceased: boolean;
  deathYear: number | null;
  /** Their parent in the tree: someone in any household shown, or null when not known. */
  parentId: string | null;
  /** The person they married into the family, shown beside them. */
  partnerId: string | null;
  /** Adopted. Present only where the viewer sees the family's own details. */
  adopted?: boolean;
  /** Their other parent (one of their parent's spouses), when the family said: a second marriage. */
  otherParentId: string | null;
  /** Divorced or separated from their partner. */
  formerPartner: boolean;
  /** Their name before they married in, to find them by. */
  maidenName?: string;
  /** The same person, listed in other households here: shown once, as this entry. */
  alsoListed?: { memberId: string; familyId: string; headName: string }[];
}

export interface TreeHousehold {
  family: LinkedFamily;
  /** The viewer may edit this family: say who is whose parent, or that two entries are one person. */
  canEdit: boolean;
  /** For via 'person': whose parents' family this is (a wife's माहेर, a head's parents). */
  through?: { id: string; name: string };
  /** The generation of this household's head. */
  generation: number;
  /** How it joins the tree: a family link, 'person' (someone's parents live there), or null for the family the tree is drawn for. */
  via: LinkKind | 'person' | null;
  members: TreePerson[];
}

export interface FamilyTree {
  rootId: string;
  households: TreeHousehold[];
  /** In-laws and relatives of the root family: shown beside the tree, not placed in it. */
  side: { kind: LinkKind; family: LinkedFamily }[];
  /** More households were linked than the tree shows. */
  truncated: boolean;
}
