import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MongoStore } from '../src/middleware/rate-limit';
import { prefixTokens, searchWords } from '../src/models/plugins';
import { mongoGrid } from '../src/utils/storage';
import { clearDb, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

describe('rate limit counts shared in MongoDB', () => {
  const store = () => {
    const s = new MongoStore('t:');
    s.init({ windowMs: 60_000 } as Parameters<MongoStore['init']>[0]);
    return s;
  };

  it('counts per key within a window, across store instances', async () => {
    const a = store();
    const b = store();
    expect((await a.increment('u:1')).totalHits).toBe(1);
    expect((await b.increment('u:1')).totalHits).toBe(2);
    expect((await a.increment('u:2')).totalHits).toBe(1);
    await a.decrement('u:1');
    expect((await b.increment('u:1')).totalHits).toBe(2);
    await a.resetKey('u:1');
    expect((await a.increment('u:1')).totalHits).toBe(1);
  });

  it('starts a fresh window once the old one has ended', async () => {
    const s = new MongoStore('t:');
    s.init({ windowMs: 50 } as Parameters<MongoStore['init']>[0]);
    await s.increment('k');
    await s.increment('k');
    await new Promise((r) => setTimeout(r, 80));
    const { totalHits, resetTime } = await s.increment('k');
    expect(totalHits).toBe(1);
    expect(resetTime?.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('photos in GridFS', () => {
  it('stores, replaces, reads and removes by key', async () => {
    const grid = mongoGrid('test-photos');
    expect(await grid.read('members/a.jpg')).toBeNull();
    await grid.put('members/a.jpg', Buffer.from('first'));
    await grid.put('members/a.jpg', Buffer.from('second'));
    expect((await grid.read('members/a.jpg'))?.toString()).toBe('second');
    await grid.remove('members/a.jpg');
    expect(await grid.read('members/a.jpg')).toBeNull();
  });
});

describe('search tokens', () => {
  it('indexes every prefix of every word, lower-cased, in any script', () => {
    expect(prefixTokens('Anil Wagh')).toEqual(['a', 'an', 'ani', 'anil', 'w', 'wa', 'wag', 'wagh']);
    expect(prefixTokens('सुनीता')).toContain('सुनीता');
    expect(prefixTokens(null)).toEqual([]);
    expect(searchWords('  Wagh  an ')).toEqual(['wagh', 'an']);
  });
});
