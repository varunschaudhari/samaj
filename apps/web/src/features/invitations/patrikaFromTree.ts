import type { FamilyTree, InvitationKind, Language, TreePerson } from '@samaj/shared';
import { isRemembrance } from './kinds';

/*
 * The names a printed patrika carries, worked out from the family tree:
 * whose occasion it is and whose child they are, the elders invoked (कृपाछत्र,
 * those who have passed away) and blessing (आशीर्वाद, those living), and who
 * invites (निमंत्रक). A starting point: every line stays editable.
 */

export interface Person extends TreePerson {
  place: string;
}

export interface PatrikaFill {
  honoree: { name: string; detail: string | null };
  forNames: string;
  kripa: string[];
  blessings: string[];
  inviters: string[];
  memorialMemberId: string | null;
}

/** Everyone in the tree once, with the place of the household they are listed in. */
export function treePeople(tree: FamilyTree): Person[] {
  const seen = new Set<string>();
  return tree.households.flatMap((h) =>
    h.members.flatMap((m) => {
      if (seen.has(m.id)) return [];
      seen.add(m.id);
      return [{ ...m, place: h.family.place }];
    }),
  );
}

const ADULT_AGE = 18;
const isAdult = (p: Person) => p.birthYear === null || new Date().getFullYear() - p.birthYear >= ADULT_AGE;

/** श्री. / सौ. / कै., or Shri / Smt. / Late: how a patrika prints an elder's name. */
export function titled(p: Pick<Person, 'name' | 'gender' | 'deceased'>, language: Language): string {
  if (language === 'mr') return `${p.deceased ? 'कै.' : p.gender === 'female' ? 'सौ.' : 'श्री.'} ${p.name}`;
  return `${p.deceased ? 'Late' : p.gender === 'female' ? 'Smt.' : 'Shri'} ${p.name}`;
}

/** चि. for a son; चि.सौ.कां. for a bride, कु. for a girl otherwise. Marathi only: English cards print the name. */
function honorific(p: Person, kind: InvitationKind, language: Language): string {
  if (language !== 'mr') return p.name;
  if (kind === 'shashtyabdi' || kind === 'housewarming') return titled(p, language);
  if (p.gender === 'female') return `${kind === 'wedding' || kind === 'engagement' ? 'चि.सौ.कां.' : 'कु.'} ${p.name}`;
  return `चि. ${p.name}`;
}

export function makeTree(people: Person[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const spouseOf = (p: Person): Person | undefined =>
    people.find((q) => q.partnerId === p.id && !q.formerPartner) ?? (p.partnerId && !p.formerPartner ? byId.get(p.partnerId) : undefined);
  /** Father first, then mother, when the tree knows them. */
  const parentsOf = (x: Person): Person[] => {
    const a = x.parentId ? byId.get(x.parentId) : undefined;
    if (!a) return [];
    const b = x.otherParentId ? byId.get(x.otherParentId) : spouseOf(a);
    return [a, b].filter((p): p is Person => Boolean(p)).sort((p, q) => (p.gender === 'male' ? -1 : q.gender === 'male' ? 1 : 0));
  };
  const childrenOf = (x: Person): Person[] => people.filter((c) => c.parentId === x.id || c.otherParentId === x.id || (c.parentId && spouseOf(x)?.id === c.parentId));
  return { byId, spouseOf, parentsOf, childrenOf };
}

/** The patrika's names for an occasion of `ego`, from their place in the tree. */
export function fillFromTree(ego: Person, people: Person[], kind: InvitationKind, language: Language, words: { son: string; daughter: string; and: string }): PatrikaFill {
  const { parentsOf, spouseOf, childrenOf } = makeTree(people);
  const parents = parentsOf(ego);

  if (isRemembrance(kind)) {
    // The family remembering: their husband or wife, and their children.
    const family = [spouseOf(ego), ...childrenOf(ego)].filter((p): p is Person => Boolean(p) && !p?.deceased && isAdult(p as Person));
    return {
      honoree: { name: titled({ ...ego, deceased: true }, language), detail: null },
      forNames: titled({ ...ego, deceased: true }, language),
      kripa: [],
      blessings: [],
      inviters: family.map((p) => titled(p, language)),
      memorialMemberId: ego.id,
    };
  }

  const parentLine = parents.map((p) => titled(p, language)).join(words.and);
  const detail = parentLine ? `${(ego.gender === 'female' ? words.daughter : words.son).replace('{parents}', parentLine)}, ${ego.place}` : ego.place;
  // Two generations above the parents: grandparents and great-grandparents, on both sides.
  const grand = parents.flatMap(parentsOf);
  const elders = [...grand, ...grand.flatMap(parentsOf)];
  const unique = (list: Person[]) => [...new Map(list.map((p) => [p.id, p])).values()];
  const livingParents = parents.filter((p) => !p.deceased);
  return {
    honoree: { name: honorific(ego, kind, language), detail },
    forNames: ego.name,
    kripa: unique([...parents.filter((p) => p.deceased), ...elders.filter((p) => p.deceased)]).map((p) => titled(p, language)),
    blessings: unique(elders.filter((p) => !p.deceased)).map((p) => titled(p, language)),
    inviters: livingParents.map((p) => titled(p, language)),
    memorialMemberId: null,
  };
}
