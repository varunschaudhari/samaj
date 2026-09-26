import { VALIDATION_KEYS } from '@samaj/shared';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { isMessageKey, translate } from './index';
import { mr } from './mr';

describe('dictionaries', () => {
  it('translate every validation key the shared schemas can produce', () => {
    for (const key of VALIDATION_KEYS) expect(isMessageKey(key), key).toBe(true);
  });

  it('keep placeholders identical between languages', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(mr[key]), key).toBe(placeholders(en[key]));
    }
  });

  it('formats numbers in Devanagari digits for Marathi', () => {
    expect(translate('en', 'directory.count', { count: 124800 })).toBe('1,24,800 members');
    expect(translate('mr', 'directory.count', { count: 48 })).toBe('४८ सदस्य');
  });
});
