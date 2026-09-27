import { type FamilyMember, PARENT_CHOICES, type Relation } from './schemas/family';

/** Years between a parent's birth and their child's, below which one of the two years is probably wrong. */
export const MIN_PARENT_AGE = 13;

export interface BirthYearProblem {
  memberId: string;
  /** 'tooClose': born too soon after their parent; 'afterDeath': born more than a year after their parent passed away. */
  kind: 'tooClose' | 'afterDeath';
  parentId: string;
  /** For 'tooClose': the years between them. */
  years?: number;
}

type Person = Pick<FamilyMember, 'id' | 'relation' | 'isHead' | 'birthYear' | 'deceased' | 'deathYear' | 'parentId' | 'partnerId'>;

/** Who is someone's parent within one family, as the family tree works it out from relations (without other families). */
function parentsOf(p: Person, people: Person[]): Person[] {
  const first = (...relations: Relation[]) => {
    for (const r of relations) {
      const found = people.find((x) => x.relation === r);
      if (found) return [found];
    }
    return [];
  };
  switch (p.relation) {
    case 'son':
    case 'daughter':
      return people.filter((x) => x.isHead || x.relation === 'spouse');
    case 'head':
    case 'brother':
    case 'sister':
      return first('father', 'mother');
    case 'father':
    case 'uncle':
    case 'paternalAunt':
      return first('grandfather', 'grandmother');
    case 'grandfather':
      return first('greatGrandfather', 'greatGrandmother');
    default: {
      const allowed = PARENT_CHOICES[p.relation];
      if (!allowed) return [];
      const candidates = people.filter((x) => x.id !== p.id && allowed.includes(x.relation));
      const parent = candidates.find((x) => x.id === p.parentId) ?? (candidates.length === 1 ? candidates[0] : undefined);
      // The parent's wife or husband too, when the family said who that is.
      return parent ? [parent, ...people.filter((x) => x.partnerId === parent.id)] : [];
    }
  }
}

/**
 * Birth years that can't both be right: a child born less than
 * MIN_PARENT_AGE years after their parent, or more than a year after the
 * parent passed away. Only people with the years filled in are checked.
 */
export function birthYearProblems(people: Person[]): BirthYearProblem[] {
  const problems: BirthYearProblem[] = [];
  for (const p of people) {
    if (!p.birthYear) continue;
    for (const parent of parentsOf(p, people)) {
      if (parent.id === p.id) continue;
      if (parent.birthYear && p.birthYear - parent.birthYear < MIN_PARENT_AGE) {
        problems.push({ memberId: p.id, kind: 'tooClose', parentId: parent.id, years: p.birthYear - parent.birthYear });
        break;
      }
      if (parent.deceased && parent.deathYear && p.birthYear > parent.deathYear + 1) {
        problems.push({ memberId: p.id, kind: 'afterDeath', parentId: parent.id });
        break;
      }
    }
  }
  return problems;
}
