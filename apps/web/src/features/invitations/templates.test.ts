import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateFunctions, wordingsFor } from './templates';

describe('occasion templates', () => {
  it('times a full wedding around its main day, the day before included', () => {
    const tpl = TEMPLATES.find((t) => t.id === 'weddingFull')!;
    expect(templateFunctions(tpl, '2026-12-12')).toEqual([
      { name: 'साखरपुडा', startsLocal: '2026-12-11T11:00', endsLocal: '2026-12-11T14:00' },
      { name: 'हळद', startsLocal: '2026-12-11T17:00', endsLocal: '2026-12-11T20:00' },
      { name: 'लग्न', startsLocal: '2026-12-12T11:00', endsLocal: '2026-12-12T14:00' },
      { name: 'स्वागत समारंभ', startsLocal: '2026-12-12T19:00', endsLocal: '2026-12-12T22:00' },
    ]);
  });

  it('crosses month ends', () => {
    const tpl = TEMPLATES.find((t) => t.id === 'weddingSimple')!;
    expect(templateFunctions(tpl, '2027-03-01')[0]?.startsLocal).toBe('2027-02-28T17:00');
  });

  it('offers wedding lines first for a wedding, and only remembrance lines for a shraddha', () => {
    expect(wordingsFor('wedding')[0]?.for).toEqual(['wedding', 'engagement']);
    expect(wordingsFor('shraddha').every((w) => w.for === 'remembrance')).toBe(true);
  });
});
