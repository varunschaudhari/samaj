import { describe, expect, it } from 'vitest';
import { type Person, fillFromTree } from './patrikaFromTree';

const person = (id: string, name: string, extra: Partial<Person> = {}): Person => ({
  id,
  name,
  relation: 'other',
  gender: 'male',
  birthYear: 1970,
  photoUrl: null,
  isHead: false,
  generation: 0,
  deceased: false,
  deathYear: null,
  parentId: null,
  partnerId: null,
  otherParentId: null,
  formerPartner: false,
  place: 'Amalner',
  ...extra,
});

// Great-grandfather Ramrao (passed away) → Ganpat & Kamal → Anil & Sunita → Rohit, Priya.
const people = [
  person('ramrao', 'Ramrao Wagh', { birthYear: 1920, deceased: true, deathYear: 1995 }),
  person('ganpat', 'Ganpat Wagh', { birthYear: 1945, parentId: 'ramrao' }),
  person('kamal', 'Kamal Wagh', { birthYear: 1950, gender: 'female', partnerId: 'ganpat', deceased: true }),
  person('anil', 'Anil Wagh', { parentId: 'ganpat' }),
  person('sunita', 'Sunita Wagh', { gender: 'female', partnerId: 'anil' }),
  person('rohit', 'Rohit Wagh', { birthYear: 1998, parentId: 'anil' }),
  person('priya', 'Priya Wagh', { birthYear: 2001, gender: 'female', parentId: 'anil' }),
];
const words = { en: { son: 'Son of {parents}', daughter: 'Daughter of {parents}', and: ' and ' }, mr: { son: '{parents} यांचे चिरंजीव', daughter: '{parents} यांची कन्या', and: ' व ' } };

describe('the patrika from the family tree', () => {
  it('names the groom with his parents and village, the elders above them, and his parents as inviters', () => {
    const fill = fillFromTree(people[5]!, people, 'wedding', 'mr', words.mr);
    expect(fill.honoree).toEqual({ name: 'चि. Rohit Wagh', detail: 'श्री. Anil Wagh व सौ. Sunita Wagh यांचे चिरंजीव, Amalner' });
    expect(fill.kripa).toEqual(['कै. Kamal Wagh', 'कै. Ramrao Wagh']);
    expect(fill.blessings).toEqual(['श्री. Ganpat Wagh']);
    expect(fill.inviters).toEqual(['श्री. Anil Wagh', 'सौ. Sunita Wagh']);
    expect(fill.memorialMemberId).toBeNull();
  });

  it('calls a bride चि.सौ.कां. and a daughter "Daughter of" in English', () => {
    expect(fillFromTree(people[6]!, people, 'wedding', 'mr', words.mr).honoree.name).toBe('चि.सौ.कां. Priya Wagh');
    expect(fillFromTree(people[6]!, people, 'wedding', 'en', words.en).honoree).toEqual({ name: 'Priya Wagh', detail: 'Daughter of Shri Anil Wagh and Smt. Sunita Wagh, Amalner' });
  });

  it('for a remembrance, remembers them as कै. and lists their husband or wife and children as the family', () => {
    const fill = fillFromTree(people[2]!, people, 'shraddha', 'mr', words.mr);
    expect(fill.forNames).toBe('कै. Kamal Wagh');
    expect(fill.memorialMemberId).toBe('kamal');
    expect(fill.inviters).toEqual(['श्री. Ganpat Wagh', 'श्री. Anil Wagh']);
  });
});
