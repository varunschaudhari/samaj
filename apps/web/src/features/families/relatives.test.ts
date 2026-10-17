import type { TreePerson } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { addOptions } from './relatives';

const person = (id: string, relation: TreePerson['relation'], extra: Partial<TreePerson> = {}): TreePerson => ({
  id,
  name: id,
  relation,
  gender: 'male',
  birthYear: null,
  photoUrl: null,
  isHead: relation === 'head',
  generation: 0,
  deceased: false,
  deathYear: null,
  parentId: null,
  partnerId: null,
  otherParentId: null,
  formerPartner: false,
  ...extra,
});

const head = person('anil', 'head');
const wife = person('sunita', 'spouse', { gender: 'female', partnerId: 'anil' });
const sagar = person('sagar', 'son', { parentId: 'anil' });
const neha = person('neha', 'daughterInLaw', { gender: 'female', partnerId: 'sagar' });
const rohit = person('rohit', 'son', { parentId: 'anil' });
const family = [head, wife, sagar, neha, rohit];
const short = (list: ReturnType<typeof addOptions>) => list.map((o) => [o.kind, o.label, o.relation, o.parentId ?? '', o.partnerId ?? '']);

describe('adding from the tree', () => {
  it('for the head: children, parents and siblings, and no second wife while there is one', () => {
    expect(short(addOptions(head, family))).toEqual([
      ['child', 'son', 'son', '', ''],
      ['child', 'daughter', 'daughter', '', ''],
      ['parent', 'father', 'father', '', ''],
      ['parent', 'mother', 'mother', '', ''],
      ['sibling', 'brother', 'brother', '', ''],
      ['sibling', 'sister', 'sister', '', ''],
    ]);
  });

  it("for a married son: his children are the head's grandchildren, with him as their parent", () => {
    const options = addOptions(sagar, family);
    expect(short(options).filter(([kind]) => kind === 'child')).toEqual([
      ['child', 'son', 'grandson', 'sagar', ''],
      ['child', 'daughter', 'granddaughter', 'sagar', ''],
    ]);
    // He has a wife; his parents are the head and her; his siblings are the head's children.
    expect(options.some((o) => o.kind === 'spouse' || o.kind === 'parent')).toBe(false);
    expect(short(options).filter(([kind]) => kind === 'sibling')).toEqual([
      ['sibling', 'brother', 'son', '', ''],
      ['sibling', 'sister', 'daughter', '', ''],
    ]);
  });

  it('for an unmarried son: a wife who is the daughter-in-law, partnered to him', () => {
    expect(addOptions(rohit, family).find((o) => o.kind === 'spouse')).toEqual({ kind: 'spouse', label: 'wife', relation: 'daughterInLaw', gender: 'female', partnerId: 'rohit' });
  });

  it("for a daughter-in-law: her children are her husband's, and her parents are left to her माहेर", () => {
    const options = addOptions(neha, family);
    expect(short(options)).toEqual([
      ['child', 'son', 'grandson', 'sagar', ''],
      ['child', 'daughter', 'granddaughter', 'sagar', ''],
    ]);
  });

  it("for the head's father: his own parents, and his other children are the head's brothers and sisters", () => {
    const father = person('ramrao', 'father', { generation: -1 });
    const options = short(addOptions(father, [...family, father]));
    expect(options).toContainEqual(['child', 'son', 'brother', '', '']);
    expect(options).toContainEqual(['spouse', 'wife', 'mother', '', '']);
    expect(options).toContainEqual(['parent', 'father', 'grandfather', '', '']);
    expect(options).toContainEqual(['sibling', 'brother', 'uncle', '', '']);
  });
});
