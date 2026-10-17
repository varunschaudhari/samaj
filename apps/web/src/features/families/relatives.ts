import { type Gender, PARENT_CHOICES, PARTNER_CHOICES, type Relation, type TreePerson } from '@samaj/shared';

/*
 * Adding someone from the tree, next to a person already in it. Relations
 * are kept relative to the household's head, so "a son of Sagar" is the
 * head's grandson whose parent is Sagar: this works out which relation, and
 * which parent or partner, each "Add …" means for the person tapped.
 */

export type AddKind = 'child' | 'spouse' | 'parent' | 'sibling';

/** One "Add …" button: what it says, and how the new person is filled in. */
export interface AddRelative {
  kind: AddKind;
  /** The word on the button: son, daughter, wife, husband, father, mother, brother, sister. */
  label: 'son' | 'daughter' | 'wife' | 'husband' | 'father' | 'mother' | 'brother' | 'sister';
  relation: Relation;
  gender: Gender;
  parentId?: string;
  partnerId?: string;
}

type Pair = readonly [male: Relation, female: Relation];

/** Their children, as the head would call them. */
const CHILDREN: Partial<Record<Relation, Pair>> = {
  head: ['son', 'daughter'],
  spouse: ['son', 'daughter'],
  son: ['grandson', 'granddaughter'],
  daughter: ['grandson', 'granddaughter'],
  daughterInLaw: ['grandson', 'granddaughter'],
  sonInLaw: ['grandson', 'granddaughter'],
  grandson: ['greatGrandson', 'greatGranddaughter'],
  granddaughter: ['greatGrandson', 'greatGranddaughter'],
  granddaughterInLaw: ['greatGrandson', 'greatGranddaughter'],
  grandsonInLaw: ['greatGrandson', 'greatGranddaughter'],
  brother: ['nephew', 'niece'],
  sister: ['nephew', 'niece'],
  sisterInLaw: ['nephew', 'niece'],
  father: ['brother', 'sister'],
  mother: ['brother', 'sister'],
  grandfather: ['uncle', 'paternalAunt'],
  grandmother: ['uncle', 'paternalAunt'],
};

/** Their brothers and sisters. */
const SIBLINGS: Partial<Record<Relation, Pair>> = {
  head: ['brother', 'sister'],
  brother: ['brother', 'sister'],
  sister: ['brother', 'sister'],
  son: ['son', 'daughter'],
  daughter: ['son', 'daughter'],
  grandson: ['grandson', 'granddaughter'],
  granddaughter: ['grandson', 'granddaughter'],
  greatGrandson: ['greatGrandson', 'greatGranddaughter'],
  greatGranddaughter: ['greatGrandson', 'greatGranddaughter'],
  nephew: ['nephew', 'niece'],
  niece: ['nephew', 'niece'],
  father: ['uncle', 'paternalAunt'],
  mother: ['maternalUncle', 'maternalAunt'],
};

/** Their parents, where they are this household's own: the head's, the head's father's. */
const PARENTS: Partial<Record<Relation, Pair>> = {
  head: ['father', 'mother'],
  brother: ['father', 'mother'],
  sister: ['father', 'mother'],
  father: ['grandfather', 'grandmother'],
  uncle: ['grandfather', 'grandmother'],
  paternalAunt: ['grandfather', 'grandmother'],
  grandfather: ['greatGrandfather', 'greatGrandmother'],
};

/** Who they marry: a wife for a son is a daughter-in-law. */
const SPOUSE: Partial<Record<Relation, Relation>> = {
  son: 'daughterInLaw',
  daughter: 'sonInLaw',
  grandson: 'granddaughterInLaw',
  granddaughter: 'grandsonInLaw',
  brother: 'sisterInLaw',
  uncle: 'aunt',
  maternalUncle: 'maternalUncleWife',
  father: 'mother',
  mother: 'father',
  grandfather: 'grandmother',
  grandmother: 'grandfather',
  greatGrandfather: 'greatGrandmother',
};

/** Married into this household: their own parents live in their माहेर. */
export const marriedIn = (p: Pick<TreePerson, 'relation'>) => p.relation === 'spouse' || Boolean(PARTNER_CHOICES[p.relation]) || p.relation === 'mother' || p.relation === 'grandmother';

/**
 * The "Add …" buttons for someone, given everyone in their household. Parents
 * are offered only while the tree has none for them; a husband or wife only
 * while they have no current one.
 */
export function addOptions(person: TreePerson, household: readonly TreePerson[]): AddRelative[] {
  const out: AddRelative[] = [];
  const pair = (kind: AddKind, relations: Pair | undefined, labels: readonly [AddRelative['label'], AddRelative['label']], extra: (r: Relation) => Partial<AddRelative> = () => ({})) => {
    if (!relations) return;
    relations.forEach((relation, i) => out.push({ kind, label: labels[i] as AddRelative['label'], relation, gender: i === 0 ? 'male' : 'female', ...extra(relation) }));
  };
  const relation: Relation = person.isHead ? 'head' : person.relation;
  // A grandchild's or nephew's parent is the blood relative: for someone who married in, their partner.
  const bloodId = marriedIn(person) && person.partnerId ? person.partnerId : person.id;

  pair('child', CHILDREN[relation], ['son', 'daughter'], (r) => (PARENT_CHOICES[r] ? { parentId: bloodId } : {}));

  const partners = household.filter((p) => (p.id === person.partnerId || p.partnerId === person.id) && !p.formerPartner);
  if (partners.length === 0 && !(relation === 'spouse')) {
    const spouse: Relation | undefined = relation === 'head' ? 'spouse' : SPOUSE[relation];
    if (spouse) {
      const gender: Gender = person.gender === 'male' ? 'female' : 'male';
      out.push({ kind: 'spouse', label: gender === 'female' ? 'wife' : 'husband', relation: spouse, gender, ...(PARTNER_CHOICES[spouse] && { partnerId: person.id }) });
    }
  }

  if (!person.parentId && !marriedIn(person)) pair('parent', PARENTS[relation], ['father', 'mother']);

  pair('sibling', SIBLINGS[relation], ['brother', 'sister'], (r) => (PARENT_CHOICES[r] && person.parentId ? { parentId: person.parentId } : {}));
  return out;
}
