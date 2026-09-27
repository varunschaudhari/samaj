import { type FamilyTree, type LinkedFamily, PARENT_CHOICES, type TreePerson, nameKey } from '@samaj/shared';

/** Sizes in CSS pixels at 100% zoom. Cards are all one size so generations line up across the whole chart. */
export const CARD_W = 184;
export const CARD_H = 72;
const COUPLE_GAP = 12;
const SIBLING_GAP = 24;
const ROOT_GAP = 56;
const ROW_GAP = 72;
const PAD = 24;
/** Room above the first row for its generation label. */
const TOP = 48;

export interface ChartPerson extends TreePerson {
  household: LinkedFamily;
  rootHousehold: boolean;
  x: number;
  y: number;
}

/** A person, and beside them whoever married into the family with them. */
interface Unit {
  people: ChartPerson[];
  generation: number;
  children: Unit[];
  x: number;
}

export interface ChartLayout {
  people: ChartPerson[];
  /**
   * Parent to child: down from the parents, across, down to the child. Dashed
   * for adoption, dotted across a generation nobody listed; `marriedIn` from a
   * wife's (or husband's) parents in their माहेर to where they stand now.
   */
  connectors: { x1: number; y1: number; midY: number; x2: number; y2: number; dashed: boolean; skips: boolean; marriedIn?: boolean }[];
  /** Between a person and each partner beside them: straight to the first, over the top to a second; dashed if they separated. */
  couples: { path: string; former: boolean }[];
  /** Someone whose parents the family hasn't said yet: a short dashed stub above them. */
  stubs: { x: number; y: number }[];
  rows: { generation: number; y: number }[];
  width: number;
  height: number;
}

const byAge = (a: ChartPerson, b: ChartPerson) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999) || a.name.localeCompare(b.name);

/**
 * Lay the tree out top to bottom by generation. Each couple is centred over
 * its children; each subtree gets its own width, so nothing overlaps.
 * Households are already joined person to person by the API (parentId and
 * partnerId), so this only arranges what it is given, and survives loops in
 * it.
 */
export function layoutTree(tree: FamilyTree): ChartLayout {
  const people: ChartPerson[] = tree.households.flatMap((h) =>
    h.members.map((m) => ({ ...m, household: h.family, rootHousehold: h.via === null, x: 0, y: 0 })),
  );
  if (people.length === 0) return { people, connectors: [], couples: [], stubs: [], rows: [], width: 0, height: 0 };
  const byId = new Map(people.map((p) => [p.id, p]));
  const generations = [...new Set(people.map((p) => p.generation))].sort((a, b) => a - b);
  const minGeneration = generations[0] ?? 0;
  const rowY = (g: number) => TOP + (g - minGeneration) * (CARD_H + ROW_GAP);

  // A partner stands beside the person they married, unless that person is someone's partner too.
  const standsBeside = (p: ChartPerson) => {
    const other = p.partnerId ? byId.get(p.partnerId) : undefined;
    return Boolean(other && !other.partnerId);
  };
  const unitOf = new Map<string, Unit>();
  const units: Unit[] = [];
  for (const p of people.filter((x) => !standsBeside(x))) {
    const unit: Unit = { people: [p], generation: p.generation, children: [], x: 0 };
    units.push(unit);
    unitOf.set(p.id, unit);
  }
  for (const p of people.filter(standsBeside)) {
    const unit = unitOf.get(p.partnerId ?? '');
    if (!unit) continue;
    unit.people.push(p);
    unitOf.set(p.id, unit);
  }
  // A current spouse next to them, a former one further out.
  for (const u of units) {
    const [first, ...partners] = u.people;
    if (first) u.people = [first, ...partners.sort((a, b) => Number(a.formerPartner) - Number(b.formerPartner))];
  }

  // Under their parents' unit, unless that would make a loop.
  const parentUnit = (u: Unit) => {
    const id = u.people[0]?.parentId;
    return id ? unitOf.get(id) : undefined;
  };
  const isAbove = (upper: Unit, lower: Unit) => {
    let at: Unit | undefined = upper;
    for (let i = 0; at && i < 64; i++) {
      if (at === lower) return true;
      at = parentUnit(at);
    }
    return false;
  };
  const roots: Unit[] = [];
  for (const u of units) {
    const parent = parentUnit(u);
    if (parent && parent !== u && !isAbove(parent, u)) parent.children.push(u);
    else roots.push(u);
  }
  const anchor = (u: Unit) => u.people[0] as ChartPerson;
  // Which of the parent's spouses a child's other parent is: the one named, or the current one.
  const otherParent = (u: Unit, child: ChartPerson) => u.people.find((p) => p.id === child.otherParentId) ?? u.people.find((p, i) => i > 0 && !p.formerPartner) ?? u.people[1];
  // Each spouse's children together, under them, oldest first.
  for (const u of units) {
    const side = (c: Unit) => u.people.indexOf(otherParent(u, anchor(c)) as ChartPerson);
    u.children.sort((a, b) => side(a) - side(b) || byAge(anchor(a), anchor(b)));
  }
  // The family the tree is drawn for comes first in its generation.
  roots.sort((a, b) => a.generation - b.generation || Number(anchor(b).rootHousehold) - Number(anchor(a).rootHousehold) || byAge(anchor(a), anchor(b)));

  const ownWidth = (u: Unit) => u.people.length * CARD_W + (u.people.length - 1) * COUPLE_GAP;
  const span = new Map<Unit, number>();
  const childrenWidth = (u: Unit) => u.children.reduce((sum, c) => sum + (span.get(c) ?? 0), 0) + SIBLING_GAP * Math.max(0, u.children.length - 1);
  const measure = (u: Unit): number => {
    u.children.forEach(measure);
    const width = Math.max(ownWidth(u), childrenWidth(u));
    span.set(u, width);
    return width;
  };
  roots.forEach(measure);

  const place = (u: Unit, left: number) => {
    const width = span.get(u) ?? ownWidth(u);
    let x = left + (width - childrenWidth(u)) / 2;
    for (const c of u.children) {
      place(c, x);
      x += (span.get(c) ?? 0) + SIBLING_GAP;
    }
    const first = u.children[0];
    const last = u.children.at(-1);
    // Centre the couple over the first and last child.
    const centre = first && last ? (anchor(first).x + anchor(last).x + CARD_W) / 2 : left + width / 2;
    u.x = Math.min(Math.max(centre - ownWidth(u) / 2, left), left + width - ownWidth(u));
    u.people.forEach((p, i) => {
      p.x = u.x + i * (CARD_W + COUPLE_GAP);
      p.y = rowY(u.generation);
    });
  };
  let left = PAD;
  for (const r of roots) {
    place(r, left);
    left += (span.get(r) ?? 0) + ROOT_GAP;
  }

  const connectors: ChartLayout['connectors'] = [];
  const couples: ChartLayout['couples'] = [];
  for (const u of units) {
    const y = rowY(u.generation);
    const first = anchor(u);
    u.people.slice(1).forEach((p, i) => {
      const path =
        i === 0
          ? `M${first.x + CARD_W},${y + CARD_H / 2} H${p.x}`
          : // Over the top of whoever stands between them.
            `M${first.x + (CARD_W * 3) / 4},${y} V${y - 10} H${p.x + CARD_W / 2} V${y}`;
      couples.push({ path, former: p.formerPartner });
    });
    for (const c of u.children) {
      const child = anchor(c);
      const other = otherParent(u, child);
      connectors.push({
        x1: other ? (first.x + other.x + CARD_W) / 2 : first.x + CARD_W / 2,
        y1: y + CARD_H,
        midY: child.y - ROW_GAP / 2,
        x2: child.x + CARD_W / 2,
        y2: child.y,
        dashed: child.adopted === true,
        skips: child.generation - u.generation > 1,
      });
    }
  }
  for (const p of people.filter(standsBeside)) {
    const parents = p.parentId ? unitOf.get(p.parentId) : undefined;
    if (!parents) continue;
    connectors.push({
      x1: parents.x + ownWidth(parents) / 2,
      y1: rowY(parents.generation) + CARD_H,
      midY: p.y - ROW_GAP / 2,
      x2: p.x + CARD_W / 2,
      y2: p.y,
      dashed: false,
      skips: p.generation - parents.generation > 1,
      marriedIn: true,
    });
  }
  const stubs = roots.flatMap((u) => {
    const p = anchor(u);
    return PARENT_CHOICES[p.relation] && !p.parentId ? [{ x: p.x + CARD_W / 2, y: p.y }] : [];
  });

  return {
    people,
    connectors,
    couples,
    stubs,
    rows: generations.map((g) => ({ generation: g, y: rowY(g) })),
    width: left - ROOT_GAP + PAD,
    height: rowY(generations.at(-1) ?? 0) + CARD_H + PAD,
  };
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Everyone whose name (or name before marriage) has a word starting with each
 * word typed: "roh wa" finds "Rohit Anil Wagh". Also by the spelling-tolerant
 * key, so रोहित and "Rohit", or "Choudhary" and "Chaudhari", find each other.
 */
export function findPeople<T extends { name: string; maidenName?: string }>(people: T[], query: string): T[] {
  const typed = fold(query).split(/\s+/).filter(Boolean);
  if (typed.length === 0) return [];
  return people.filter((p) => {
    const words = fold(`${p.name} ${p.maidenName ?? ''}`).split(/\s+/).filter(Boolean);
    const keys = words.map(nameKey);
    return typed.every((w) => {
      const key = nameKey(w);
      return words.some((n) => n.startsWith(w)) || (key !== '' && keys.some((k) => k.startsWith(key)));
    });
  });
}
