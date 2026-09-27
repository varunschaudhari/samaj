import { describe, expect, it } from 'vitest';
import { nameKey, nameKeys, toLatin } from './names';

describe('toLatin', () => {
  it.each([
    ['रोहित', 'rohit'],
    ['गणपत', 'ganpat'],
    ['कमल', 'kamal'],
    ['रमेश', 'ramesh'],
    ['देशमुख', 'deshmukh'],
    ['पाटील', 'paatiil'],
    ['संजय', 'sanjay'],
    ['लक्ष्मी', 'lakshmii'],
    ['वाघमारे', 'vaaghmaare'],
  ])('writes %s as %s', (devanagari, latin) => {
    expect(toLatin(devanagari)).toBe(latin);
  });

  it('leaves Latin letters alone', () => {
    expect(toLatin('Rohit Wagh')).toBe('Rohit Wagh');
  });
});

describe('nameKey', () => {
  it.each([
    ['रोहित', 'Rohit'],
    ['वाघ', 'Wagh'],
    ['पाटील', 'Patil'],
    ['चौधरी', 'Chaudhari'],
    ['Chaudhary', 'Choudhari'],
    ['लक्ष्मी', 'Laxmi'],
    ['Lakshmi', 'Laxmi'],
    ['गणपत', 'Ganpat'],
    ['Phadke', 'Fadke'],
  ])('%s and %s are the same name', (a, b) => {
    expect(nameKey(a)).toBe(nameKey(b));
  });

  it('keeps different names apart', () => {
    expect(nameKey('Rohit')).not.toBe(nameKey('Rahul'));
    expect(nameKey('Patil')).not.toBe(nameKey('Pawar'));
  });

  it('keys every word, leaving out ones with nothing left', () => {
    expect(nameKeys('Rohit Anil Wagh')).toEqual([nameKey('Rohit'), nameKey('Anil'), nameKey('Wagh')]);
    expect(nameKeys('a')).toEqual(['a']);
    expect(nameKeys(null)).toEqual([]);
  });
});
