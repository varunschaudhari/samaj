import { describe, expect, it } from 'vitest';
import { formatPhone, phoneSchema } from './common';

describe('phoneSchema', () => {
  it.each([
    ['9822012345', '+919822012345'],
    ['98220 12345', '+919822012345'],
    ['+91-98220-12345', '+919822012345'],
    ['09822012345', '+919822012345'],
    ['919822012345', '+919822012345'],
    ['0091 9822012345', '+919822012345'],
  ])('normalises %s', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it.each(['12345', '5822012345', '98220123456', 'abcdefghij', ''])('rejects %s', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });

  it('formats for display', () => {
    expect(formatPhone('+919822012345')).toBe('+91 98220 12345');
  });
});
