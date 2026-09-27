import {
  type FamilyTree,
  INVERSE_LINK,
  type LinkKind,
  type LinkedFamily,
  PARENT_CHOICES,
  PARTNER_CHOICES,
  RELATION_GENERATION,
  type Relation,
  TREE_DEPTH,
  TREE_MAX_HOUSEHOLDS,
  type TreeHousehold,
  type TreePerson,
} from '@samaj/shared';
import { Types } from 'mongoose';
import { FamilyLinkModel } from '../models/family-link.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { notFound } from '../utils/app-error';
import { canEditFamily, canViewFamily, hasReach } from './access';
import { photoUrl } from './family.service';
import { familySummaries, movesOutOf } from './links.service';
import type { Viewer } from './viewer';

/** Links that place a household in the tree, and the generation step each one takes. */
const STEP: Partial<Record<LinkKind, number>> = { parents: -1, children: 1, siblings: 0 };

/** A person's parent before households are joined: someone, nobody known, or whoever another person's parent is. */
type ParentRef = string | null | { sameAs: string };

interface Node {
  person: TreePerson;
  relation: Relation;
  parent: ParentRef;
  partner: string | null;
  storedParent: string | null;
  storedPartner: string | null;
}

const words = (name: string) => name.toLowerCase().replace(/\./g, ' ').split(/\s+/).filter(Boolean);

/**
 * The same person listed in two households: same first and last word, so
 * "Rohit Anil Wagh" (with his father's name, as Marathi names often are) and
 * "Rohit Wagh" match, with the same gender and generation and birth years
 * that don't disagree.
 */
function samePerson(a: TreePerson, b: TreePerson): boolean {
  const x = words(a.name);
  const y = words(b.name);
  const years = a.birthYear === null || b.birthYear === null || a.birthYear === b.birthYear;
  return x.length > 0 && y.length > 0 && x[0] === y[0] && x.at(-1) === y.at(-1) && years && a.gender === b.gender && a.generation === b.generation;
}

/**
 * Who is whose child and whose partner within one household, from each
 * person's relation to the head, or the family's own choice where the
 * relation doesn't say (which son a grandchild belongs to).
 */
function tieWithin(nodes: Node[]) {
  // Someone who married out can't be anyone's parent or partner here.
  const here = nodes.filter((n) => !n.person.movedTo);
  const head = nodes.find((n) => n.person.isHead)?.person.id ?? null;
  const firstOf = (...relations: Relation[]) => {
    for (const r of relations) {
      const n = here.find((x) => x.relation === r);
      if (n) return n.person.id;
    }
    return null;
  };
  // The family's choice if it still fits, otherwise the only person it could be.
  const choose = (stored: string | null, allowed: readonly Relation[]) => {
    const candidates = here.filter((x) => allowed.includes(x.relation));
    if (stored && candidates.some((c) => c.person.id === stored)) return stored;
    return candidates.length === 1 ? (candidates[0]?.person.id ?? null) : null;
  };

  // With a generation not listed (grandparents but no father), the nearest one up: the chart draws that line dotted.
  for (const n of nodes) {
    switch (n.relation) {
      case 'head':
        n.parent = firstOf('father', 'mother', 'grandfather', 'grandmother', 'greatGrandfather', 'greatGrandmother');
        break;
      case 'son':
      case 'daughter':
        n.parent = head;
        break;
      case 'brother':
      case 'sister':
        if (head) n.parent = { sameAs: head };
        break;
      case 'father':
      case 'uncle':
        n.parent = firstOf('grandfather', 'grandmother', 'greatGrandfather', 'greatGrandmother');
        break;
      case 'grandfather':
        n.parent = firstOf('greatGrandfather', 'greatGrandmother');
        break;
      case 'spouse':
        n.partner = head;
        break;
      case 'mother':
        n.partner = firstOf('father');
        break;
      case 'grandmother':
        n.partner = firstOf('grandfather');
        break;
      case 'greatGrandmother':
        n.partner = firstOf('greatGrandfather');
        break;
      default: {
        const parents = PARENT_CHOICES[n.relation];
        const partners = PARTNER_CHOICES[n.relation];
        if (parents) n.parent = choose(n.storedParent, parents);
        if (partners) n.partner = choose(n.storedPartner, partners);
      }
    }
  }
}

/**
 * The tree around one family: walk accepted parents / children / siblings
 * links breadth first, up to TREE_DEPTH generations each way and
 * TREE_MAX_HOUSEHOLDS households. Each household's head sits at the
 * generation the walk reached it; its people are placed by relation, and
 * joined person to person: children to their parents, partners side by
 * side, and a household's head to the head of the household it was linked
 * from. Someone listed in two linked households shows once. In-laws and
 * relatives of the root family come back separately.
 */
export async function getTree(viewer: Viewer, familyId: string): Promise<FamilyTree> {
  const gone = () => notFound('That family is no longer in the directory.');
  if (!Types.ObjectId.isValid(familyId)) throw gone();
  const root = await FamilyModel.findById(familyId, { history: 0 }).lean();
  if (!root || !canViewFamily(viewer, root)) throw gone();

  const placed = new Map<string, { generation: number; via: LinkKind | null; from: string | null }>([[familyId, { generation: 0, via: null, from: null }]]);
  const side: { kind: LinkKind; id: string }[] = [];
  let frontier = [familyId];
  let truncated = false;

  while (frontier.length > 0) {
    const ids = frontier.map((id) => new Types.ObjectId(id));
    const links = await FamilyLinkModel.find({ status: 'accepted', $or: [{ fromFamilyId: { $in: ids } }, { toFamilyId: { $in: ids } }] }).lean();
    const next: string[] = [];
    for (const link of links) {
      for (const [self, other, kind] of [
        [String(link.fromFamilyId), String(link.toFamilyId), link.kind],
        [String(link.toFamilyId), String(link.fromFamilyId), INVERSE_LINK[link.kind]],
      ] as const) {
        const at = frontier.includes(self) ? placed.get(self) : undefined;
        if (!at || placed.has(other)) continue;
        const step = STEP[kind];
        if (step === undefined) {
          // In-laws and relatives: listed beside the root family only.
          if (self === familyId && !side.some((s) => s.id === other)) side.push({ kind, id: other });
          continue;
        }
        const generation = at.generation + step;
        if (Math.abs(generation) > TREE_DEPTH) continue;
        if (placed.size >= TREE_MAX_HOUSEHOLDS) {
          truncated = true;
          continue;
        }
        placed.set(other, { generation, via: kind, from: self });
        next.push(other);
      }
    }
    frontier = next;
  }

  const allIds = [...placed.keys(), ...side.map((s) => s.id)];
  const [families, members, summaries, movedOut] = await Promise.all([
    FamilyModel.find({ _id: { $in: allIds.map((id) => new Types.ObjectId(id)) } }, { history: 0 }).lean(),
    MemberModel.find({ familyId: { $in: [...placed.keys()].map((id) => new Types.ObjectId(id)) } })
      .sort({ isHead: -1, birthYear: 1, createdAt: 1 })
      .lean(),
    familySummaries(viewer, allIds),
    movesOutOf(viewer, [...placed.keys()]),
  ]);
  const familyBy = new Map(families.map((f) => [String(f._id), f]));

  // Everyone the viewer may see, household by household.
  const shown: { id: string; summary: LinkedFamily; generation: number; via: LinkKind | null; nodes: Node[] }[] = [];
  for (const [id, at] of placed) {
    const family = familyBy.get(id);
    const summary = summaries.get(id);
    // Only families the viewer could open anyway.
    if (!family || !summary?.canView) continue;
    const canEdit = canEditFamily(viewer, family);
    const seesPending = canEdit || hasReach(viewer, 'member:verify', family);
    const node = (person: TreePerson, stored: { parentId?: unknown; partnerId?: unknown } = {}): Node => ({
      person,
      relation: person.relation,
      parent: null,
      partner: null,
      storedParent: stored.parentId ? String(stored.parentId) : null,
      storedPartner: stored.partnerId ? String(stored.partnerId) : null,
    });
    const nodes = members
      .filter((m) => String(m.familyId) === id && (seesPending || (m.approval !== 'pending' && m.listed !== false)))
      .map((m) =>
        node(
          {
            id: String(m._id),
            name: m.name,
            relation: m.relation,
            gender: m.gender,
            birthYear: m.birthYear ?? null,
            photoUrl: photoUrl(m),
            isHead: m.isHead,
            generation: at.generation + RELATION_GENERATION[m.relation],
            deceased: m.deceased === true,
            deathYear: m.deathYear ?? null,
            parentId: null,
            partnerId: null,
            // Adoption is the family's own business: others see a son as a son.
            ...(seesPending && { adopted: m.adopted === true }),
          },
          m,
        ),
      )
      .concat(
        movedOut
          .filter((o) => o.fromFamilyId === id && (o.family.canView || canEdit) && (seesPending || o.member.listed !== false))
          .map((o) => {
            // Moves recorded before the old relation was kept: most who marry out are a son or daughter.
            const relation: Relation = o.relation ?? (o.member.gender === 'female' ? 'daughter' : 'son');
            return node({
              id: String(o.member._id),
              name: o.member.name,
              relation,
              gender: o.member.gender,
              birthYear: o.member.birthYear ?? null,
              photoUrl: photoUrl(o.member),
              isHead: false,
              generation: at.generation + RELATION_GENERATION[relation],
              movedTo: o.family,
              deceased: o.member.deceased === true,
              deathYear: o.member.deathYear ?? null,
              parentId: null,
              partnerId: null,
            });
          }),
      );
    tieWithin(nodes);
    shown.push({ id, summary, generation: at.generation, via: at.via, nodes });
  }

  const nodeBy = new Map(shown.flatMap((h) => h.nodes.map((n) => [n.person.id, n] as const)));
  const headOf = (householdId: string) => shown.find((h) => h.id === householdId)?.nodes.find((n) => n.person.isHead);
  const alias = new Map<string, string>();
  const real = (id: string) => {
    let at = id;
    for (let i = 0; i < 50 && alias.has(at); i++) at = alias.get(at) ?? at;
    return at;
  };
  const directParent = (n: Node | undefined) => (n && typeof n.parent === 'string' ? nodeBy.get(n.parent) : undefined);
  const partnersOf = (n: Node) => [...nodeBy.values()].filter((x) => x.partner === n.person.id);

  /**
   * `a` and `b` are one person, listed in two households: keep one (the head
   * of their own household, if either is), and match up their parents and
   * partners too.
   */
  const same = (a: Node | undefined, b: Node | undefined) => {
    if (!a || !b || a === b || !samePerson(a.person, b.person)) return;
    const [from, into] = a.person.isHead && !b.person.isHead ? [b, a] : [a, b];
    if (alias.has(from.person.id) || real(into.person.id) === from.person.id) return;
    alias.set(from.person.id, real(into.person.id));
    same(directParent(from), directParent(into));
    for (const p of partnersOf(from)) same(p, partnersOf(into).find((q) => samePerson(p.person, q.person)));
  };

  // Join households along their links, head to head.
  for (const h of shown) {
    const at = placed.get(h.id);
    const other = at?.from ? shown.find((s) => s.id === at.from) : undefined;
    if (!at?.via || !other) continue;
    if (at.via === 'siblings') {
      const a = headOf(h.id);
      const b = headOf(other.id);
      if (!a || !b) continue;
      same(other.nodes.find((n) => ['brother', 'sister'].includes(n.relation) && samePerson(n.person, a.person)), a);
      same(h.nodes.find((n) => ['brother', 'sister'].includes(n.relation) && samePerson(n.person, b.person)), b);
      // Both still list their father (and so their mother).
      same(
        h.nodes.find((n) => n.relation === 'father'),
        other.nodes.find((n) => n.relation === 'father'),
      );
      // Brothers and sisters share parents: whoever the other head's are.
      if (a.parent === null) a.parent = { sameAs: b.person.id };
      continue;
    }
    // One household is the other's parents' family.
    const [parents, child] = at.via === 'children' ? [other, h] : [h, other];
    const p = headOf(parents.id);
    const c = headOf(child.id);
    if (!p || !c) continue;
    // The son still listed in his parents' family, and the father still listed in his son's.
    same(parents.nodes.find((n) => ['son', 'daughter'].includes(n.relation) && samePerson(n.person, c.person)), c);
    same(child.nodes.find((n) => ['father', 'mother'].includes(n.relation) && samePerson(n.person, p.person)), p);
    c.parent = p.person.id;
  }

  // Settle "same parents as …", then point everything at the person each id really is.
  const parentOf = (n: Node, depth = 0): string | null => {
    if (depth > 10) return null;
    if (n.parent === null || typeof n.parent === 'string') return n.parent;
    const sibling = nodeBy.get(real(n.parent.sameAs));
    return sibling && sibling !== n ? parentOf(sibling, depth + 1) : null;
  };
  const tie = (id: string | null, self: string) => {
    const to = id === null ? null : real(id);
    return to !== null && to !== self && nodeBy.has(to) ? to : null;
  };
  const settle = () => {
    for (const n of nodeBy.values()) {
      if (alias.has(n.person.id)) continue;
      n.person.parentId = tie(parentOf(n), n.person.id);
      n.person.partnerId = tie(n.partner, n.person.id);
    }
  };
  settle();

  // Still twice under the same parents or beside the same partner (a son listed as a son and as the head's brother): once.
  const kept: Node[] = [];
  for (const n of nodeBy.values()) {
    if (alias.has(n.person.id)) continue;
    const twin = kept.find(
      (k) =>
        samePerson(k.person, n.person) &&
        ((n.person.parentId !== null && k.person.parentId === n.person.parentId) || (n.person.partnerId !== null && k.person.partnerId === n.person.partnerId)),
    );
    if (!twin) {
      kept.push(n);
      continue;
    }
    // Keep the one who heads their own household.
    if (n.person.isHead && !twin.person.isHead) {
      alias.set(twin.person.id, n.person.id);
      kept.splice(kept.indexOf(twin), 1, n);
    } else {
      alias.set(n.person.id, twin.person.id);
    }
  }
  settle();

  const households: TreeHousehold[] = shown.map((h) => ({
    family: h.summary,
    generation: h.generation,
    via: h.via,
    members: h.nodes.filter((n) => !alias.has(n.person.id)).map((n) => n.person),
  }));

  return {
    rootId: familyId,
    households,
    side: side.flatMap((s) => {
      const summary = summaries.get(s.id);
      return summary?.canView ? [{ kind: s.kind, family: summary }] : [];
    }),
    truncated,
  };
}
