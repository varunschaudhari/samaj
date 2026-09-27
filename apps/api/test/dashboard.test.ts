import type { Dashboard } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  // Jalgaon District: Bhusawal 2 verified + 1 pending, Amalner 1 verified. Pune: 1 verified.
  await createFamily(branches.bhusawal, { people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh' }] });
  await createFamily(branches.bhusawal);
  await createFamily(branches.bhusawal, { status: 'pending' });
  await createFamily(branches.amalner);
  await createFamily(branches.pune);
});

const dashboard = async (cookie: string) => {
  const res = await api.get('/api/dashboard').set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body.dashboard as Dashboard;
};

describe('GET /api/dashboard', () => {
  it('shows a district committee its district, town by town', async () => {
    const { cookie } = await createFamily(branches.district, { account: 'committee' });
    const d = await dashboard(cookie);
    expect(d.scope).toMatchObject({ name: 'Jalgaon District', kind: 'district' });
    // Their own family (verified, placed in the district itself) counts too.
    expect(d.families).toEqual({ verified: 4, pending: 1, rejected: 0 });
    expect(d.members).toBe(5);
    const byName = Object.fromEntries(d.branches.map((b) => [b.name, b]));
    expect(byName.Bhusawal).toMatchObject({ families: 3, verified: 2, pending: 1 });
    expect(byName.Amalner).toMatchObject({ families: 1, verified: 1, pending: 0 });
    expect(byName['Jalgaon District']).toMatchObject({ families: 1, committee: 1 });
    expect(byName['Pune District']).toBeUndefined();
    expect(d.submissions).toHaveLength(8);
    expect(d.submissions.at(-1)?.count).toBe(5);
  });

  it('shows admins every district', async () => {
    const { cookie } = await createFamily(branches.pune, { account: 'admin' });
    const d = await dashboard(cookie);
    expect(d.scope).toBeNull();
    expect(d.families.verified).toBe(5);
    expect(d.branches.map((b) => b.name).sort()).toEqual(['Jalgaon District', 'Pune District']);
    expect(d.branches.find((b) => b.name === 'Jalgaon District')).toMatchObject({ families: 4, pending: 1 });
  });

  it('is closed to members', async () => {
    const { cookie } = await createFamily(branches.amalner, { account: 'member' });
    expect((await api.get('/api/dashboard').set('Cookie', cookie)).status).toBe(403);
  });
});
