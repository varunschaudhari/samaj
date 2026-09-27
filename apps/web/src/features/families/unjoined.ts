import { type FamilyTree, PARENT_CHOICES, type Relation, SPOUSE_RELATIONS, type TreePerson } from '@samaj/shared';

/**
 * Someone in this family the tree can't join upward yet:
 *  - 'parents': the head, whose parents aren't listed here and whose parents' home isn't joined;
 *  - 'maher': someone who married in, whose माहेर isn't joined;
 *  - 'whoseChild': a grandchild, nephew or niece whose parent the family hasn't said.
 */
export interface Unjoined {
  person: TreePerson;
  kind: 'parents' | 'maher' | 'whoseChild';
}

/** Elders who married in: their parents are generations back, and seldom listed anywhere. */
const ELDERS: readonly Relation[] = ['mother', 'grandmother', 'greatGrandmother'];

/** Who in this family the tree leaves without parents, and what would join them. */
export function unjoinedIn(tree: FamilyTree, familyId: string): Unjoined[] {
  const home = tree.households.find((h) => h.family.id === familyId);
  if (!home) return [];
  return home.members.flatMap((p): Unjoined[] => {
    if (p.parentId || p.movedTo) return [];
    if (p.isHead) return [{ person: p, kind: 'parents' }];
    if (SPOUSE_RELATIONS.includes(p.relation) && !ELDERS.includes(p.relation)) return [{ person: p, kind: 'maher' }];
    if (PARENT_CHOICES[p.relation]) return [{ person: p, kind: 'whoseChild' }];
    return [];
  });
}
