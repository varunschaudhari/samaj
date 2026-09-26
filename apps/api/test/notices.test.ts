import type { NoticeFeed } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
let districtCommittee: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  districtCommittee = (await createFamily(branches.district, { account: 'committee', people: [{ name: 'District Secretary' }] })).cookie;
});

const notice = (branchId: string, extra: Record<string, unknown> = {}) => ({
  title: 'Annual gathering on Sunday',
  body: 'All families are invited to the samaj hall at 10 am.',
  kind: 'meeting',
  branchId,
  ...extra,
});

const feed = async (cookie: string, query = '') => (await api.get(`/api/notices${query}`).set('Cookie', cookie)).body as NoticeFeed;
const titles = (f: NoticeFeed) => [...f.pinned, ...f.items].map((n) => n.title);

describe('notices', () => {
  it('reach families in the branch and every town under it, but not elsewhere', async () => {
    await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district, { title: 'District meeting' }));
    await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.bhusawal, { title: 'Bhusawal only' }));

    const bhusawal = (await createFamily(branches.bhusawal, { account: 'member' })).cookie;
    const amalner = (await createFamily(branches.amalner, { account: 'member' })).cookie;
    const pune = (await createFamily(branches.pune, { account: 'member' })).cookie;

    expect(titles(await feed(bhusawal)).sort()).toEqual(['Bhusawal only', 'District meeting']);
    expect(titles(await feed(amalner))).toEqual(['District meeting']);
    expect(titles(await feed(pune))).toEqual([]);
  });

  it('are readable by families still waiting for verification', async () => {
    await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district));
    const pending = (await createFamily(branches.amalner, { status: 'pending', account: 'member' })).cookie;
    expect(titles(await feed(pending))).toHaveLength(1);
  });

  it('can be posted only within the poster’s branch, and only by committee or admin', async () => {
    const townCommittee = (await createFamily(branches.bhusawal, { account: 'committee' })).cookie;
    const tooHigh = await api.post('/api/notices').set('Cookie', townCommittee).send(notice(branches.district));
    expect(tooHigh.status).toBe(403);
    expect(tooHigh.body.error.issues).toEqual([{ path: 'branchId', message: 'validation.noticeBranch' }]);

    const member = (await createFamily(branches.bhusawal, { account: 'member' })).cookie;
    expect((await api.post('/api/notices').set('Cookie', member).send(notice(branches.bhusawal))).status).toBe(403);

    const admin = (await createFamily(branches.pune, { account: 'admin' })).cookie;
    expect((await api.post('/api/notices').set('Cookie', admin).send(notice(branches.bhusawal))).status).toBe(201);
  });

  it('puts pinned notices on top, limits pins per branch, and pages the rest', async () => {
    for (let i = 0; i < 5; i++) {
      await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district, { title: `Pinned ${i}`, pinned: true }));
    }
    const sixth = await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district, { pinned: true }));
    expect(sixth.body.error.issues).toEqual([{ path: 'pinned', message: 'validation.pinLimit' }]);

    for (let i = 0; i < 3; i++) await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district, { title: `Plain ${i}` }));
    const first = await feed(districtCommittee, '?limit=2');
    expect(first.pinned).toHaveLength(5);
    expect(first.items.map((n) => n.title)).toEqual(['Plain 2', 'Plain 1']);
    const second = await feed(districtCommittee, `?limit=2&cursor=${first.nextCursor}`);
    expect(second.pinned).toHaveLength(0);
    expect(second.items.map((n) => n.title)).toEqual(['Plain 0']);
  });

  it('can be edited and removed by the branch committee, not by others', async () => {
    const created = (await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.bhusawal))).body.notice;
    expect(created.permissions.canEdit).toBe(true);

    const townCommittee = (await createFamily(branches.amalner, { account: 'committee' })).cookie;
    expect((await api.put(`/api/notices/${created.id}`).set('Cookie', townCommittee).send(notice(branches.bhusawal))).status).toBe(403);

    const edited = await api.put(`/api/notices/${created.id}`).set('Cookie', districtCommittee).send(notice(branches.bhusawal, { title: 'Moved to Monday' }));
    expect(edited.body.notice).toMatchObject({ title: 'Moved to Monday' });
    expect(edited.body.notice.editedAt).toBeTruthy();

    expect((await api.delete(`/api/notices/${created.id}`).set('Cookie', districtCommittee)).status).toBe(204);
    expect(titles(await feed(districtCommittee))).toEqual([]);
  });

  it('filters by kind and validates input', async () => {
    await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district, { kind: 'condolence', title: 'Condolence' }));
    await api.post('/api/notices').set('Cookie', districtCommittee).send(notice(branches.district));
    expect(titles(await feed(districtCommittee, '?kind=condolence'))).toEqual(['Condolence']);

    const bad = await api.post('/api/notices').set('Cookie', districtCommittee).send({ title: 'x', body: '', kind: 'gossip', branchId: branches.district });
    const byPath = Object.fromEntries(bad.body.error.issues.map((i: { path: string; message: string }) => [i.path, i.message]));
    expect(byPath).toEqual({ title: 'validation.noticeTitle', body: 'validation.noticeBody', kind: 'validation.choose' });
  });
});
