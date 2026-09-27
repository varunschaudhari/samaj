import type { FamilyTree, TreePerson } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { CARD_H, CARD_W, findPeople, layoutTree } from './tree-layout';

const family = { id: 'f1', headName: 'Anil Wagh', place: 'Bhusawal', branch: { id: 'b1', name: 'Bhusawal', nameMr: 'भुसावळ' }, canView: true };
const person = (id: string, relation: TreePerson['relation'], generation: number, ties: Partial<TreePerson> = {}): TreePerson => ({
  id,
  name: `${id} Wagh`,
  relation,
  gender: 'male',
  birthYear: null,
  photoUrl: null,
  isHead: relation === 'head',
  generation,
  deceased: false,
  deathYear: null,
  parentId: null,
  partnerId: null,
  otherParentId: null,
  formerPartner: false,
  ...ties,
});
const treeOf = (members: TreePerson[]): FamilyTree => ({ rootId: 'f1', households: [{ family, canEdit: true, generation: 0, via: null, members }], side: [], truncated: false });

describe('layoutTree', () => {
  const tree = treeOf([
    person('Anil', 'head', 0),
    person('Sunita', 'spouse', 0, { gender: 'female', partnerId: 'Anil' }),
    person('Rohit', 'son', 1, { parentId: 'Anil', birthYear: 1990 }),
    person('Kavya', 'daughterInLaw', 1, { gender: 'female', partnerId: 'Rohit' }),
    person('Sagar', 'son', 1, { parentId: 'Anil', birthYear: 1994 }),
    person('Aarav', 'grandson', 2, { parentId: 'Rohit' }),
    person('Isha', 'granddaughter', 2, { gender: 'female', parentId: 'Sagar', adopted: true }),
    person('Dev', 'grandson', 2),
  ]);
  const layout = layoutTree(tree);
  const at = Object.fromEntries(layout.people.map((p) => [p.id, p]));

  it('puts each generation on its own row, partners side by side', () => {
    expect(at.Anil?.y).toBe(at.Sunita?.y);
    expect(at.Rohit?.y).toBeGreaterThan(at.Anil?.y ?? 0);
    expect(at.Aarav?.y).toBeGreaterThan(at.Rohit?.y ?? 0);
    expect(at.Kavya?.y).toBe(at.Rohit?.y);
    expect(at.Kavya?.x).toBeGreaterThan(at.Rohit?.x ?? 0);
    // Older son first.
    expect(at.Rohit?.x).toBeLessThan(at.Sagar?.x ?? 0);
  });

  it('centres parents over their children and keeps children under their own parents', () => {
    const middle = ((at.Rohit?.x ?? 0) + (at.Sagar?.x ?? 0) + CARD_W) / 2;
    const couple = ((at.Anil?.x ?? 0) + (at.Sunita?.x ?? 0) + CARD_W) / 2;
    expect(Math.abs(couple - middle)).toBeLessThan(1);
    expect(Math.abs((at.Aarav?.x ?? 0) - (at.Rohit?.x ?? 0))).toBeLessThan(CARD_W);
    expect(Math.abs((at.Isha?.x ?? 0) - (at.Sagar?.x ?? 0))).toBeLessThan(CARD_W);
  });

  it('never overlaps two cards', () => {
    for (const a of layout.people) {
      for (const b of layout.people) {
        if (a === b || a.y !== b.y) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(CARD_W);
      }
    }
    expect(layout.height).toBeGreaterThanOrEqual((at.Aarav?.y ?? 0) + CARD_H);
  });

  it('draws adoption dashed, and marks a grandchild whose parents nobody set', () => {
    expect(layout.connectors.filter((c) => c.dashed)).toHaveLength(1);
    // Anil to his two sons, Rohit to Aarav, Sagar to Isha.
    expect(layout.connectors).toHaveLength(4);
    expect(layout.stubs).toEqual([{ x: (at.Dev?.x ?? 0) + CARD_W / 2, y: at.Dev?.y }]);
  });

  it('draws a line from a wife’s parents in her माहेर to where she stands beside her husband', () => {
    const joined = layoutTree(
      treeOf([
        person('Rohit', 'head', 0),
        person('Priya', 'spouse', 0, { gender: 'female', partnerId: 'Rohit', parentId: 'Suresh' }),
        person('Suresh', 'head', -1),
      ]),
    );
    const priya = joined.people.find((p) => p.id === 'Priya');
    expect(joined.connectors).toEqual([expect.objectContaining({ marriedIn: true, x2: (priya?.x ?? 0) + CARD_W / 2, y2: priya?.y })]);
  });

  it('puts each spouse’s children under that couple, a former spouse further out', () => {
    const twice = layoutTree(
      treeOf([
        person('Anil', 'head', 0),
        person('Sunita', 'spouse', 0, { gender: 'female', partnerId: 'Anil', formerPartner: true }),
        person('Meena', 'spouse', 0, { gender: 'female', partnerId: 'Anil' }),
        person('Rohit', 'son', 1, { parentId: 'Anil', otherParentId: 'Sunita', birthYear: 1990 }),
        person('Om', 'son', 1, { parentId: 'Anil', otherParentId: 'Meena', birthYear: 2005 }),
      ]),
    );
    const at2 = Object.fromEntries(twice.people.map((p) => [p.id, p]));
    // Meena, the current wife, stands next to Anil; Sunita beyond her.
    expect(at2.Meena?.x).toBeLessThan(at2.Sunita?.x ?? 0);
    // Om (Meena's) comes before Rohit (Sunita's), though Rohit is older.
    expect(at2.Om?.x).toBeLessThan(at2.Rohit?.x ?? 0);
    const from = (id: string) => twice.connectors.find((c) => c.x2 === (at2[id]?.x ?? 0) + CARD_W / 2)?.x1;
    expect(from('Om')).toBe(((at2.Anil?.x ?? 0) + (at2.Meena?.x ?? 0) + CARD_W) / 2);
    expect(from('Rohit')).toBe(((at2.Anil?.x ?? 0) + (at2.Sunita?.x ?? 0) + CARD_W) / 2);
    expect(twice.couples.map((c) => c.former)).toEqual([false, true]);
  });

  it('hides a branch below a couple, counting who is hidden', () => {
    const folded = layoutTree(tree, new Set(['Rohit']));
    expect(folded.people.map((p) => p.id)).not.toContain('Aarav');
    expect(folded.toggles.find((g) => g.id === 'Rohit')).toMatchObject({ collapsed: true, hidden: 1 });
    expect(folded.toggles.find((g) => g.id === 'Anil')).toMatchObject({ collapsed: false, hidden: 5 });
    expect(layoutTree(tree, new Set(['Anil'])).people.map((p) => p.id).sort()).toEqual(['Anil', 'Dev', 'Sunita']);
  });

  it('survives a loop in the data', () => {
    const loop = layoutTree(treeOf([person('A', 'son', 1, { parentId: 'B' }), person('B', 'son', 1, { parentId: 'A' })]));
    expect(loop.people).toHaveLength(2);
  });
});

describe('findPeople', () => {
  const people = [{ name: 'Rohit Anil Wagh' }, { name: 'Rohini Patil' }, { name: 'Sagar Wagh' }];
  it('matches the start of any word, every word typed', () => {
    expect(findPeople(people, 'roh').map((p) => p.name)).toEqual(['Rohit Anil Wagh', 'Rohini Patil']);
    expect(findPeople(people, 'roh wa').map((p) => p.name)).toEqual(['Rohit Anil Wagh']);
    expect(findPeople(people, 'WAGH').length).toBe(2);
    expect(findPeople(people, '  ')).toEqual([]);
  });

  it('finds Marathi typing, other spellings and names before marriage', () => {
    const family = [{ name: 'Rohit Chaudhari' }, { name: 'Priya Chaudhari', maidenName: 'Priya Patil' }];
    expect(findPeople(family, 'रोहित').map((p) => p.name)).toEqual(['Rohit Chaudhari']);
    expect(findPeople(family, 'choudhary').length).toBe(2);
    expect(findPeople(family, 'patil').map((p) => p.name)).toEqual(['Priya Chaudhari']);
  });
});
