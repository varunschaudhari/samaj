import type { TreePerson } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { findInTree, kinshipFrom, kinshipPath } from './kinship';

const p = (id: string, gender: 'male' | 'female', ties: Partial<TreePerson> = {}): TreePerson => ({
  id,
  name: id,
  relation: 'other',
  gender,
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
  ...ties,
});

// Ganpat and Parvati; their sons Anil (with Sunita) and Sunil (with Lata), daughter Asha (with Dilip).
// Sunita's parents Suresh and Kamal, her brother Mahesh (with Vaishali) and sister Meena.
// Anil's children Rohit (with Kavya) and Sagar; Sunil's son Vijay; Asha's son Amit; Mahesh's son Om; Meena's daughter Pooja.
// Rohit's son Aarav (with Neha); Kavya's brother Amol.
const people = [
  p('Ganpat', 'male'),
  p('Parvati', 'female', { partnerId: 'Ganpat' }),
  p('Anil', 'male', { parentId: 'Ganpat' }),
  p('Sunita', 'female', { partnerId: 'Anil', parentId: 'Suresh' }),
  p('Sunil', 'male', { parentId: 'Ganpat' }),
  p('Lata', 'female', { partnerId: 'Sunil' }),
  p('Asha', 'female', { parentId: 'Ganpat' }),
  p('Dilip', 'male', { partnerId: 'Asha' }),
  p('Suresh', 'male'),
  p('Kamal', 'female', { partnerId: 'Suresh' }),
  p('Mahesh', 'male', { parentId: 'Suresh' }),
  p('Vaishali', 'female', { partnerId: 'Mahesh' }),
  p('Meena', 'female', { parentId: 'Suresh' }),
  p('Rohit', 'male', { parentId: 'Anil' }),
  p('Kavya', 'female', { partnerId: 'Rohit', parentId: 'Kishor' }),
  p('Kishor', 'male'),
  p('Amol', 'male', { parentId: 'Kishor' }),
  p('Sagar', 'male', { parentId: 'Anil' }),
  p('Rupa', 'female', { partnerId: 'Sagar' }),
  p('Yash', 'male', { parentId: 'Sagar' }),
  p('Vijay', 'male', { parentId: 'Sunil' }),
  p('Amit', 'male', { parentId: 'Asha' }),
  p('Om', 'male', { parentId: 'Mahesh' }),
  p('Pooja', 'female', { parentId: 'Meena' }),
  p('Aarav', 'male', { parentId: 'Rohit' }),
  p('Neha', 'female', { partnerId: 'Aarav' }),
  p('Stranger', 'male'),
];

describe('kinshipFrom', () => {
  it('names everyone around Rohit, on both sides', () => {
    const kin = kinshipFrom('Rohit', people);
    expect(Object.fromEntries(kin)).toMatchObject({
      Rohit: 'kin.self',
      Anil: 'kin.father',
      Sunita: 'kin.mother',
      Ganpat: 'kin.grandfather',
      Parvati: 'kin.grandmother',
      Suresh: 'kin.grandfather',
      Sagar: 'kin.brother',
      Kavya: 'kin.wife',
      Aarav: 'kin.son',
      Neha: 'kin.sonsWife',
      Sunil: 'kin.paternalUncle',
      Lata: 'kin.paternalUncleWife',
      Asha: 'kin.paternalAunt',
      Dilip: 'kin.paternalAuntHusband',
      Mahesh: 'kin.maternalUncle',
      Vaishali: 'kin.maternalUncleWife',
      Meena: 'kin.maternalAunt',
      Vijay: 'kin.cousin.fb.m',
      Amit: 'kin.cousin.fs.m',
      Om: 'kin.cousin.mb.m',
      Pooja: 'kin.cousin.ms.f',
      Kishor: 'kin.fatherInLaw',
      Amol: 'kin.wifesBrother',
    });
    expect(kin.has('Stranger')).toBe(false);
  });

  it('reads the other way round too', () => {
    const kin = kinshipFrom('Kavya', people);
    expect(kin.get('Sagar')).toBe('kin.husbandsBrother');
    expect(kin.get('Anil')).toBe('kin.fatherInLaw');
    expect(kin.get('Aarav')).toBe('kin.son');
    const fromAnil = kinshipFrom('Anil', people);
    expect(fromAnil.get('Kavya')).toBe('kin.sonsWife');
    expect(fromAnil.get('Aarav')).toBe('kin.grandson');
    expect(fromAnil.get('Neha')).toBe('kin.grandsonsWife');
    expect(fromAnil.get('Kishor')).toBe('kin.vyahi');
    expect(fromAnil.get('Vijay')).toBe('kin.brothersSon');
    expect(fromAnil.get('Amit')).toBe('kin.sistersSon');
    expect(fromAnil.get('Dilip')).toBe('kin.sistersHusband');
    expect(kinshipFrom('Sunil', people).get('Sunita')).toBe('kin.brothersWife');
  });

  it('names a woman’s in-laws the way she would', () => {
    const kin = kinshipFrom('Kavya', people);
    expect(kin.get('Rupa')).toBe('kin.husbandsBrothersWife');
    expect(kin.get('Yash')).toBe('kin.husbandsBrothersSon');
    expect(kin.get('Ganpat')).toBe('kin.grandfatherInLaw');
    expect(kinshipFrom('Rohit', people).get('Kavya')).toBe('kin.wife');
  });

  it('counts a generation nobody listed: the head’s grandfather with no father between', () => {
    const skip = [p('Ramrao', 'male', { generation: -2 }), p('Sitabai', 'female', { generation: -2, partnerId: 'Ramrao' }), p('Head', 'male', { generation: 0, parentId: 'Ramrao' }), p('Suresh', 'male', { generation: 0, parentId: 'Ramrao' })];
    const kin = kinshipFrom('Head', skip);
    expect(kin.get('Ramrao')).toBe('kin.grandfather');
    expect(kin.get('Sitabai')).toBe('kin.grandmother');
    // Both joined to their grandfather over the same missing father: brothers.
    expect(kin.get('Suresh')).toBe('kin.brother');
    expect(kinshipFrom('Ramrao', skip).get('Head')).toBe('kin.grandson');
  });

  it('marks a former husband or wife', () => {
    const kin = kinshipFrom('A', [p('A', 'male'), p('B', 'female', { partnerId: 'A', formerPartner: true })]);
    expect(kin.get('B')).toBe('kin.formerWife');
  });

  it('gives the way between two people', () => {
    expect(kinshipPath('Rohit', 'Vijay', people)?.map((h) => `${h.step}:${h.to.id}`)).toEqual(['U:Anil', 'U:Ganpat', 'D:Sunil', 'D:Vijay']);
    expect(kinshipPath('Rohit', 'Rohit', people)).toEqual([]);
    expect(kinshipPath('Rohit', 'Stranger', people)).toBeNull();
    const merged = [...people, p('Amit2', 'male', { alsoListed: [{ memberId: 'old-amit', familyId: 'f', headName: 'x' }] })];
    expect(findInTree(merged, 'old-amit')?.id).toBe('Amit2');
  });
});
