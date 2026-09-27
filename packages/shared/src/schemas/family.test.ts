import { describe, expect, it } from 'vitest';
import { familyUpdateSchema, memberInputSchema } from './family';

describe('memberInputSchema', () => {
  const formValues = { name: ' Rohit Wagh ', relation: 'son', gender: 'male', birthYear: '1995', occupation: '', education: ' B.E. ', phone: '98220 55555' };

  it('normalises form input', () => {
    expect(memberInputSchema.parse(formValues)).toEqual({
      name: 'Rohit Wagh',
      relation: 'son',
      gender: 'male',
      birthYear: 1995,
      occupation: null,
      education: 'B.E.',
      phone: '+919822055555',
      deceased: false,
      deathYear: null,
      parentId: null,
      partnerId: null,
      adopted: false,
      otherParentId: null,
      formerPartner: false,
      birthFamilyId: null,
    });
  });

  it('keeps a chosen parent, partner or adoption only where the relation takes one', () => {
    const id = '0123456789abcdef01234567';
    expect(memberInputSchema.parse({ ...formValues, relation: 'grandson', parentId: id, adopted: true })).toMatchObject({ parentId: id, adopted: true });
    expect(memberInputSchema.parse({ ...formValues, relation: 'son', parentId: id, partnerId: id })).toMatchObject({ parentId: null, partnerId: null });
    expect(memberInputSchema.parse({ ...formValues, relation: 'daughterInLaw', gender: 'female', partnerId: id, adopted: true })).toMatchObject({ partnerId: id, adopted: false });
    expect(memberInputSchema.parse({ ...formValues, relation: 'grandson', parentId: '' }).parentId).toBeNull();
  });

  it('drops the number of someone who has passed away, and a year of passing for the living', () => {
    expect(memberInputSchema.parse({ ...formValues, deceased: true, deathYear: '2020' })).toMatchObject({ phone: null, deathYear: 2020 });
    expect(memberInputSchema.parse({ ...formValues, deathYear: '2020' })).toMatchObject({ deathYear: null });
    const backwards = memberInputSchema.safeParse({ ...formValues, deceased: true, deathYear: '1990' });
    expect(backwards.error?.issues[0]).toMatchObject({ path: ['deathYear'], message: 'validation.deathBeforeBirth' });
  });

  // The web app parses, sends the parsed values, and the API parses them again.
  it('accepts its own output unchanged', () => {
    const once = memberInputSchema.parse(formValues);
    expect(memberInputSchema.parse(once)).toEqual(once);
  });

  it('treats missing optional fields as blank', () => {
    expect(memberInputSchema.parse({ name: 'Rohit Wagh', relation: 'son', gender: 'male' })).toMatchObject({ birthYear: null, occupation: null, phone: null });
  });

  it.each(['95', '1790', '3000', 'abcd', '1995.5'])('rejects birth year %s', (birthYear) => {
    const result = memberInputSchema.safeParse({ ...formValues, birthYear });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('validation.birthYear');
  });
});

describe('familyUpdateSchema', () => {
  it('turns blank optional fields into null and is idempotent', () => {
    const once = familyUpdateSchema.parse({ place: ' Bhusawal ', gotra: '', address: '  ' });
    expect(once).toEqual({ place: 'Bhusawal', gotra: null, address: null });
    expect(familyUpdateSchema.parse(once)).toEqual(once);
  });

  it('accepts only gotras from the fixed list', () => {
    expect(familyUpdateSchema.parse({ place: 'Bhusawal', gotra: 'kashyap' }).gotra).toBe('kashyap');
    const typo = familyUpdateSchema.safeParse({ place: 'Bhusawal', gotra: 'Kashyapa' });
    expect(typo.success).toBe(false);
    expect(typo.error?.issues[0]?.message).toBe('validation.gotra');
  });
});
