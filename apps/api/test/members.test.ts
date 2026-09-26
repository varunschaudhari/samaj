import type { Member } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;

const list = async (cookie: string, query = '') => {
  const res = await api.get(`/api/members${query}`).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body as { items: Member[]; total: number; nextCursor: string | null };
};

/** A signed-in viewer whose own family isn't part of the results we assert on. */
const viewer = async (role: 'member' | 'committee' | 'admin', branchId: string) =>
  (await createFamily(branchId, { account: role, people: [{ name: `Zz ${role} viewer` }] })).cookie;

const names = (body: { items: Member[] }) => body.items.map((m) => m.name).filter((n) => !n.startsWith('Zz'));

beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  await createFamily(branches.bhusawal, { gotra: 'Kashyap', people: [{ name: 'Anil Wagh', occupation: 'Oil mill owner' }, { name: 'Rohit Wagh' }] });
  await createFamily(branches.amalner, { gotra: 'Atri', people: [{ name: 'Kavita Dhole' }] });
  await createFamily(branches.pune, { gotra: 'Kashyap', people: [{ name: 'Ramesh Karale' }] });
  await createFamily(branches.bhusawal, { status: 'pending', people: [{ name: 'Pending Person' }] });
  await createFamily(branches.bhusawal, { status: 'rejected', people: [{ name: 'Rejected Person' }] });
});

describe('GET /api/members', () => {
  it('requires a session', async () => {
    expect((await api.get('/api/members')).status).toBe(401);
  });

  it('lists only people from verified families, with their family head', async () => {
    const body = await list(await viewer('member', branches.pune));
    expect(names(body)).toEqual(['Anil Wagh', 'Kavita Dhole', 'Ramesh Karale', 'Rohit Wagh']);
    const rohit = body.items.find((m) => m.name === 'Rohit Wagh');
    expect(rohit?.familyHead).toBe('Anil Wagh');
  });

  it('is closed to members whose own family is not verified yet', async () => {
    const { cookie } = await createFamily(branches.bhusawal, { status: 'pending', account: 'member' });
    const res = await api.get('/api/members').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_VERIFIED');
  });

  it('hides phone numbers from ordinary members', async () => {
    const body = await list(await viewer('member', branches.bhusawal));
    const others = body.items.filter((m) => !m.name.startsWith('Zz'));
    expect(others.every((m) => m.phone === undefined)).toBe(true);
  });

  it('shows committee members phone numbers only inside their branch subtree', async () => {
    const body = await list(await viewer('committee', branches.district));
    const phoneByName = Object.fromEntries(body.items.map((m) => [m.name, m.phone]));
    expect(phoneByName['Anil Wagh']).toMatch(/^\+91/);
    expect(phoneByName['Kavita Dhole']).toMatch(/^\+91/);
    expect(phoneByName['Ramesh Karale']).toBeUndefined();
  });

  it('a town committee member does not see a sibling town', async () => {
    const body = await list(await viewer('committee', branches.bhusawal));
    const phoneByName = Object.fromEntries(body.items.map((m) => [m.name, m.phone]));
    expect(phoneByName['Anil Wagh']).toBeDefined();
    expect(phoneByName['Kavita Dhole']).toBeUndefined();
  });

  it('shows admins every phone number', async () => {
    const body = await list(await viewer('admin', branches.pune));
    expect(body.items.every((m) => m.phone)).toBe(true);
  });

  it('searches from the start of any word, filters by branch subtree and gotra', async () => {
    const cookie = await viewer('member', branches.pune);
    expect(names(await list(cookie, '?q=wag'))).toEqual(['Anil Wagh', 'Rohit Wagh']);
    expect(names(await list(cookie, '?q=oil'))).toEqual(['Anil Wagh']);
    expect(names(await list(cookie, '?q=agh'))).toHaveLength(0);
    expect(names(await list(cookie, `?branchId=${branches.district}`))).toHaveLength(3);
    expect(names(await list(cookie, '?gotra=kashyap'))).toEqual(['Anil Wagh', 'Ramesh Karale', 'Rohit Wagh']);
  });

  it('treats regex characters in the search as plain text', async () => {
    const cookie = await viewer('member', branches.pune);
    expect((await list(cookie, '?q=.*')).items).toHaveLength(0);
  });

  it('pages with a cursor', async () => {
    const cookie = await viewer('member', branches.pune);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await list(cookie, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((m) => m.name));
      cursor = page.nextCursor;
    } while (cursor);
    // Four verified people plus the viewer, each exactly once.
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it('lists gotras of verified families', async () => {
    const cookie = await viewer('member', branches.pune);
    const res = await api.get('/api/members/gotras').set('Cookie', cookie);
    expect(res.body.items).toEqual(['Atri', 'Kashyap']);
  });
});
