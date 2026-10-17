import type { TreePerson } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { shapePeople } from './tree-shapes';

const p = (id: string, extra: Partial<TreePerson> = {}): TreePerson => ({
  id,
  name: id,
  relation: 'other',
  gender: 'male',
  birthYear: null,
  photoUrl: null,
  isHead: false,
  generation: 0,
  deceased: false,
  deathYear: null,
  parentId: null,
  partnerId: null,
  otherParentId: null,
  formerPartner: false,
  ...extra,
});

// Ramrao & Kamal → Anil (head) & Lata; Anil & Sunita → Sagar & Priya; Sagar & Neha → Isha.
// Lata's son Ravi and Priya's son Om belong to their husbands' families; Sunita's parents are her माहेर.
const people = [
  p('ramrao'),
  p('kamal', { gender: 'female', partnerId: 'ramrao' }),
  p('anil', { isHead: true, parentId: 'ramrao' }),
  p('lata', { gender: 'female', parentId: 'ramrao' }),
  p('ravi', { parentId: 'lata' }),
  p('sunita', { gender: 'female', partnerId: 'anil', parentId: 'vishnu' }),
  p('vishnu'),
  p('gauri', { gender: 'female', partnerId: 'vishnu' }),
  p('sagar', { parentId: 'anil' }),
  p('neha', { gender: 'female', partnerId: 'sagar' }),
  p('isha', { gender: 'female', parentId: 'sagar' }),
  p('priya', { gender: 'female', parentId: 'anil' }),
  p('om', { parentId: 'priya' }),
];
const sorted = (s: Set<string>) => [...s].sort();

describe('tree shapes', () => {
  it("ancestors: both parents at every step, the mother's माहेर included", () => {
    expect(sorted(shapePeople(people, 'ancestors', 'sagar', 'anil'))).toEqual(['anil', 'gauri', 'kamal', 'ramrao', 'sagar', 'sunita', 'vishnu']);
  });

  it('descendants: children and their husbands or wives, all the way down', () => {
    expect(sorted(shapePeople(people, 'descendants', 'anil', 'anil'))).toEqual(['anil', 'isha', 'neha', 'om', 'priya', 'sagar', 'sunita']);
  });

  it("वंशावळ: from the earliest father down through sons; daughters listed, not their children; no माहेर", () => {
    expect(sorted(shapePeople(people, 'vanshavali', null, 'anil'))).toEqual(['anil', 'isha', 'kamal', 'lata', 'neha', 'priya', 'ramrao', 'sagar', 'sunita']);
  });

  it('someone missing keeps nobody, and the whole tree keeps everyone', () => {
    expect(shapePeople(people, 'ancestors', 'nobody', 'anil').size).toBe(0);
    expect(shapePeople(people, 'all', null, null).size).toBe(people.length);
  });
});
