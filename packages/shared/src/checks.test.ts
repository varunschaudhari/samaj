import { describe, expect, it } from 'vitest';
import { birthYearProblems } from './checks';

const person = (id: string, relation: string, birthYear: number | null, more: Record<string, unknown> = {}) =>
  ({ id, relation, isHead: relation === 'head', birthYear, deceased: false, deathYear: null, parentId: null, partnerId: null, ...more }) as Parameters<typeof birthYearProblems>[0][number];

describe('birthYearProblems', () => {
  it('passes a family whose years add up', () => {
    expect(
      birthYearProblems([person('anil', 'head', 1965), person('sunita', 'spouse', 1970), person('rohit', 'son', 1992), person('ramrao', 'father', 1938), person('aarav', 'grandson', 2020)]),
    ).toEqual([]);
  });

  it('flags a son listed older than the head, and a head younger than his father allows', () => {
    const problems = birthYearProblems([person('anil', 'head', 1990), person('rohit', 'son', 1985), person('ramrao', 'father', 1982)]);
    expect(problems).toEqual([
      { memberId: 'anil', kind: 'tooClose', parentId: 'ramrao', years: 8 },
      { memberId: 'rohit', kind: 'tooClose', parentId: 'anil', years: -5 },
    ]);
  });

  it('flags a grandchild born long after their parent passed away', () => {
    const problems = birthYearProblems([
      person('anil', 'head', 1950),
      person('rohit', 'son', 1975, { deceased: true, deathYear: 2000 }),
      person('aarav', 'grandson', 2010, { parentId: 'rohit' }),
    ]);
    expect(problems).toEqual([{ memberId: 'aarav', kind: 'afterDeath', parentId: 'rohit' }]);
  });

  it('leaves out people without a birth year', () => {
    expect(birthYearProblems([person('anil', 'head', null), person('rohit', 'son', 1985)])).toEqual([]);
  });
});
