import type { FamilyTree, TreePerson } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { unjoinedIn } from './unjoined';

const family = { id: 'f1', headName: 'Anil', place: 'Amalner', branch: { id: 'b', name: 'Amalner', nameMr: 'अमळनेर' }, canView: true };
const other = { ...family, id: 'f2', headName: 'Suresh' };
const p = (id: string, relation: TreePerson['relation'], more: Partial<TreePerson> = {}): TreePerson => ({
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
  ...more,
});

describe('unjoinedIn', () => {
  it('lists the head without parents, a wife without her माहेर, and a grandchild without a parent', () => {
    const tree: FamilyTree = {
      rootId: 'f1',
      households: [
        {
          family,
          canEdit: true,
          generation: 0,
          via: null,
          members: [
            p('Anil', 'head'),
            p('Sunita', 'spouse', { gender: 'female', partnerId: 'Anil' }),
            p('Rohit', 'son', { parentId: 'Anil' }),
            p('Kavya', 'daughterInLaw', { gender: 'female', partnerId: 'Rohit', parentId: 'Suresh' }),
            p('Neha', 'daughterInLaw', { gender: 'female', partnerId: 'Rohit' }),
            p('Dev', 'grandson'),
            p('Parvati', 'grandmother', { gender: 'female' }),
            p('Priya', 'daughter', { parentId: 'Anil', movedTo: other }),
          ],
        },
        { family: other, canEdit: false, generation: -1, via: 'person', members: [p('Suresh', 'head')] },
      ],
      side: [],
      truncated: false,
    };
    expect(unjoinedIn(tree, 'f1').map((u) => [u.person.id, u.kind])).toEqual([
      ['Anil', 'parents'],
      ['Sunita', 'maher'],
      ['Neha', 'maher'],
      ['Dev', 'whoseChild'],
    ]);
    // Another family's gaps are theirs to see.
    expect(unjoinedIn(tree, 'f2')).toEqual([{ person: expect.objectContaining({ id: 'Suresh' }), kind: 'parents' }]);
  });
});
