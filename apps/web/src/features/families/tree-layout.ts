import { type FamilyTree, type LinkedFamily, PARENT_CHOICES, type TreePerson } from '@samaj/shared';

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
  /** Parent to child: down from the parents, across, down to the child. Dashed for adoption, dotted across a generation nobody listed. */
  connectors: { x1: number; y1: number; midY: number; x2: number; y2: number; dashed: boolean; skips: boolean }[];
  /** Between partners standing side by side. */
  couples: { x1: number; x2: number; y: number }[];
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
  for (const u of units) u.children.sort((a, b) => byAge(anchor(a), anchor(b)));
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
    for (let i = 1; i < u.people.length; i++) {
      const before = u.people[i - 1] as ChartPerson;
      couples.push({ x1: before.x + CARD_W, x2: before.x + CARD_W + COUPLE_GAP, y: y + CARD_H / 2 });
    }
    for (const c of u.children) {
      const child = anchor(c);
      connectors.push({
        x1: u.x + ownWidth(u) / 2,
        y1: y + CARD_H,
        midY: child.y - ROW_GAP / 2,
        x2: child.x + CARD_W / 2,
        y2: child.y,
        dashed: child.adopted === true,
        skips: child.generation - u.generation > 1,
      });
    }
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

/** Everyone whose name has a word starting with each word typed: "roh wa" finds "Rohit Anil Wagh". */
export function findPeople<T extends { name: string }>(people: T[], query: string): T[] {
  const typed = fold(query).split(/\s+/).filter(Boolean);
  if (typed.length === 0) return [];
  return people.filter((p) => {
    const name = fold(p.name).split(/\s+/);
    return typed.every((w) => name.some((n) => n.startsWith(w)));
  });
}
