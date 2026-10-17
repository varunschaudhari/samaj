import type { FamilyTree, TreePerson } from '@samaj/shared';

/*
 * The tree in other shapes: one person's ancestors, their descendants, or the
 * family's वंशावळ (the father's line from the earliest ancestor the tree
 * knows: sons' families followed down, daughters listed but not their
 * children, who belong to another कुळ). Each is the same tree with fewer
 * people, so the chart draws it the same way.
 */

export type TreeShape = 'all' | 'ancestors' | 'descendants' | 'vanshavali';
export const TREE_SHAPES: TreeShape[] = ['all', 'ancestors', 'descendants', 'vanshavali'];

function joins(people: TreePerson[]) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const partnersOf = (p: TreePerson) => people.filter((q) => q.id !== p.id && (q.partnerId === p.id || p.partnerId === q.id));
  /** Both parents where the tree knows them: the one named, and their partner (or the other parent named). */
  const parentsOf = (p: TreePerson): TreePerson[] => {
    const parent = p.parentId ? byId.get(p.parentId) : undefined;
    if (!parent) return [];
    const other = p.otherParentId ? byId.get(p.otherParentId) : partnersOf(parent).find((q) => !q.formerPartner);
    return other ? [parent, other] : [parent];
  };
  /** Someone who married in has their partner's children (those of that marriage, when the tree says). */
  const childrenOf = (p: TreePerson): TreePerson[] => {
    const blood = p.partnerId && byId.has(p.partnerId) && !people.some((c) => c.parentId === p.id) ? byId.get(p.partnerId) : p;
    if (!blood) return [];
    return people.filter((c) => c.parentId === blood.id && (blood === p || !c.otherParentId || c.otherParentId === p.id));
  };
  return { byId, partnersOf, parentsOf, childrenOf };
}

/** Who a shape keeps, for `subjectId` (ancestors and descendants) or the family the tree is drawn for (वंशावळ). */
export function shapePeople(people: TreePerson[], shape: TreeShape, subjectId: string | null, rootHeadId: string | null): Set<string> {
  if (shape === 'all') return new Set(people.map((p) => p.id));
  const { byId, partnersOf, parentsOf, childrenOf } = joins(people);
  const keep = new Set<string>();

  if (shape === 'ancestors') {
    const subject = subjectId ? byId.get(subjectId) : undefined;
    if (!subject) return keep;
    const queue = [subject];
    keep.add(subject.id);
    while (queue.length) {
      for (const parent of parentsOf(queue.shift() as TreePerson)) {
        if (keep.has(parent.id)) continue;
        keep.add(parent.id);
        queue.push(parent);
      }
    }
    return keep;
  }

  if (shape === 'descendants') {
    const subject = subjectId ? byId.get(subjectId) : undefined;
    if (!subject) return keep;
    const visit = (p: TreePerson) => {
      if (keep.has(p.id)) return;
      keep.add(p.id);
      partnersOf(p).forEach((q) => keep.add(q.id));
      childrenOf(p).forEach(visit);
    };
    visit(subject);
    return keep;
  }

  // वंशावळ: up the father's line from the head, then down through sons.
  const head = rootHeadId ? byId.get(rootHeadId) : undefined;
  if (!head) return keep;
  let top: TreePerson = head;
  for (let i = 0; i < 64; i++) {
    const father: TreePerson | undefined = top.parentId ? byId.get(top.parentId) : undefined;
    if (!father || father.gender !== 'male') break;
    top = father;
  }
  const visit = (p: TreePerson) => {
    if (keep.has(p.id)) return;
    keep.add(p.id);
    partnersOf(p).forEach((q) => keep.add(q.id));
    for (const child of childrenOf(p)) {
      if (child.gender === 'male') visit(child);
      else keep.add(child.id);
    }
  };
  visit(top);
  return keep;
}

/** The same tree with only these people; households left empty drop out. */
export function filterTree(tree: FamilyTree, keep: Set<string>): FamilyTree {
  return {
    ...tree,
    households: tree.households.map((h) => ({ ...h, members: h.members.filter((m) => keep.has(m.id)) })).filter((h) => h.members.length > 0),
  };
}
