import type { TreePerson } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { findGaps } from './tree-gaps';

const p = (id: string, extra: Partial<TreePerson> = {}): TreePerson => ({
  id,
  name: id,
  relation: 'other',
  gender: 'male',
  birthYear: 1980,
  photoUrl: '/photo.jpg',
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

describe("what's missing in the tree", () => {
  it('lists each gap once per person, the joins first, only in families that may be edited', () => {
    const gaps = findGaps([
      {
        familyId: 'own',
        canEdit: true,
        members: [
          p('anil', { isHead: true, relation: 'head' }),
          p('sunita', { relation: 'spouse', gender: 'female', partnerId: 'anil', photoUrl: null }),
          p('sagar', { relation: 'son', parentId: 'anil', birthYear: null }),
          p('aarav', { relation: 'grandson' }),
          p('priya', { relation: 'daughter', parentId: 'anil', birthYear: null, movedTo: { id: 'x', headName: 'X', place: 'Pune', branch: { id: 'b', name: 'Pune', nameMr: 'पुणे' }, canView: true } }),
        ],
      },
      { familyId: 'theirs', canEdit: false, members: [p('vijay', { isHead: true, relation: 'head', birthYear: null })] },
    ]);
    expect(gaps.map((g) => [g.kind, g.person.id])).toEqual([
      ['headParents', 'anil'],
      ['whoseChild', 'aarav'],
      ['maher', 'sunita'],
      ['birthYear', 'sagar'],
      ['photo', 'sunita'],
    ]);
  });
});
