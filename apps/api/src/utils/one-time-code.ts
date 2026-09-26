import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { RESET_CODE_ALPHABET, RESET_CODE_LENGTH } from '@samaj/shared';

/*
 * Password reset and invite codes. They are short-lived, tried a few times at
 * most, and rate limited, so a plain SHA-256 is enough to keep them out of the
 * database in readable form.
 */

export function newCode(): string {
  let code = '';
  for (let i = 0; i < RESET_CODE_LENGTH; i++) code += RESET_CODE_ALPHABET[randomInt(RESET_CODE_ALPHABET.length)];
  return code;
}

export const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

export function codeMatches(storedHash: string, presented: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashCode(presented), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
