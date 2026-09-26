import type { CommitteeGroup } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
let districtCommittee: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  districtCommittee = (await createFamily(branches.district, { account: 'committee' })).cookie;
});

const bearer = (branchId: string, post: string, name: string) => ({ branchId, post, name, phone: '98220 44444' });
const groups = async (cookie: string) => (await api.get('/api/committee').set('Cookie', cookie)).body.groups as CommitteeGroup[];

describe('office-bearers', () => {
  it("show a family their own branch and district, district first, posts in order", async () => {
    await api.post('/api/committee').set('Cookie', districtCommittee).send(bearer(branches.district, 'treasurer', 'Treasurer Name'));
    await api.post('/api/committee').set('Cookie', districtCommittee).send(bearer(branches.district, 'president', 'President Name'));
    await api.post('/api/committee').set('Cookie', districtCommittee).send(bearer(branches.bhusawal, 'secretary', 'Bhusawal Secretary'));
    await api.post('/api/committee').set('Cookie', districtCommittee).send(bearer(branches.amalner, 'secretary', 'Amalner Secretary'));

    const pending = (await createFamily(branches.bhusawal, { status: 'pending', account: 'member' })).cookie;
    const seen = await groups(pending);
    expect(seen.map((g) => g.branch.name)).toEqual(['Jalgaon District', 'Bhusawal']);
    expect(seen[0]?.bearers.map((b) => b.post)).toEqual(['president', 'treasurer']);
    expect(seen[0]?.bearers[0]?.phone).toBe('+919822044444');
    expect(seen.every((g) => !g.canEdit)).toBe(true);
  });

  it('are maintained by the branch committee only', async () => {
    const town = (await createFamily(branches.bhusawal, { account: 'committee' })).cookie;
    expect((await api.post('/api/committee').set('Cookie', town).send(bearer(branches.district, 'president', 'X Y'))).status).toBe(403);
    const created = (await api.post('/api/committee').set('Cookie', town).send(bearer(branches.bhusawal, 'president', 'Town President'))).body.bearer;

    const member = (await createFamily(branches.bhusawal, { account: 'member' })).cookie;
    expect((await api.put(`/api/committee/${created.id}`).set('Cookie', member).send(bearer(branches.bhusawal, 'member', 'Changed'))).status).toBe(403);

    const edited = await api.put(`/api/committee/${created.id}`).set('Cookie', districtCommittee).send(bearer(branches.bhusawal, 'vicePresident', 'Renamed'));
    expect(edited.body.bearer).toMatchObject({ post: 'vicePresident', name: 'Renamed' });
    expect((await api.delete(`/api/committee/${created.id}`).set('Cookie', districtCommittee)).status).toBe(204);
  });

  it('validates post, name and phone', async () => {
    const res = await api.post('/api/committee').set('Cookie', districtCommittee).send({ branchId: branches.district, post: 'king', name: 'A', phone: '123' });
    const byPath = Object.fromEntries(res.body.error.issues.map((i: { path: string; message: string }) => [i.path, i.message]));
    expect(byPath).toEqual({ post: 'validation.choose', name: 'validation.nameMin', phone: 'validation.phone' });
  });
});
