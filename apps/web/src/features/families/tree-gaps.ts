import { PARENT_CHOICES, type TreePerson } from '@samaj/shared';
import { marriedIn } from './relatives';

/*
 * What the tree is missing, in the families the viewer may edit: each a
 * person and the one thing to fill in, most useful first. A tree with these
 * filled in draws itself right and reads well when printed or shared.
 */

export type GapKind = 'headParents' | 'whoseChild' | 'maher' | 'birthYear' | 'photo';
export const GAP_ORDER: GapKind[] = ['headParents', 'whoseChild', 'maher', 'birthYear', 'photo'];

export interface Gap {
  kind: GapKind;
  person: TreePerson;
  householdId: string;
}

export function findGaps(households: { familyId: string; canEdit: boolean; members: TreePerson[] }[]): Gap[] {
  const gaps: Gap[] = [];
  for (const h of households.filter((x) => x.canEdit)) {
    // Someone who moved to another family is that family's to complete.
    for (const p of h.members.filter((m) => !m.movedTo)) {
      const add = (kind: GapKind) => gaps.push({ kind, person: p, householdId: h.familyId });
      if (p.isHead && !p.parentId) add('headParents');
      if (PARENT_CHOICES[p.relation] && !p.parentId) add('whoseChild');
      if (!p.isHead && marriedIn(p) && !p.parentId) add('maher');
      if (!p.birthYear) add('birthYear');
      if (!p.photoUrl) add('photo');
    }
  }
  return gaps.sort((a, b) => GAP_ORDER.indexOf(a.kind) - GAP_ORDER.indexOf(b.kind) || (a.person.birthYear ?? 9999) - (b.person.birthYear ?? 9999));
}
