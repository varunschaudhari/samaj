import type { Branch, BranchSummary } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyModel } from '../src/models/family.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
let admin: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  admin = (await createFamily(branches.pune, { account: 'admin' })).cookie;
});

const town = (parentId: string, name = 'Dharangaon', nameMr = 'धरणगाव') => ({ name, nameMr, kind: 'town', parentId });

describe('managing branches', () => {
  it('lets an admin add a town inside a district, which the public list then shows', async () => {
    const res = await api.post('/api/branches').set('Cookie', admin).send(town(branches.district));
    expect(res.status).toBe(201);
    expect(res.body.branch).toMatchObject({ name: 'Dharangaon', nameMr: 'धरणगाव', kind: 'town', parentId: branches.district });

    const list = (await api.get('/api/branches')).body.items as Branch[];
    expect(list.map((b) => b.name)).toContain('Dharangaon');
  });

  it('adds a district with no parent', async () => {
    const res = await api.post('/api/branches').set('Cookie', admin).send({ name: 'Dhule District', nameMr: 'धुळे जिल्हा', kind: 'district' });
    expect(res.status).toBe(201);
    expect(res.body.branch.parentId).toBeNull();
  });

  it('keeps the tree two levels deep', async () => {
    const underTown = await api.post('/api/branches').set('Cookie', admin).send(town(branches.bhusawal));
    expect(underTown.status).toBe(400);
    expect(underTown.body.error.issues).toEqual([{ path: 'parentId', message: 'validation.branchParentInvalid' }]);

    const orphanTown = await api.post('/api/branches').set('Cookie', admin).send({ name: 'Erandol', nameMr: 'एरंडोल', kind: 'town' });
    expect(orphanTown.body.error.issues[0].message).toBe('validation.branchParentRequired');
  });

  it('refuses a duplicate name among siblings, ignoring case', async () => {
    const res = await api.post('/api/branches').set('Cookie', admin).send(town(branches.district, 'amalner', 'अमळनेर शहर'));
    expect(res.status).toBe(409);
    expect(res.body.error.issues).toEqual([{ path: 'name', message: 'validation.branchExists' }]);
  });

  it('renames a branch, and families whose place was the old name follow it', async () => {
    const family = await createFamily(branches.amalner);
    const res = await api.put(`/api/branches/${branches.amalner}`).set('Cookie', admin).send({ name: 'Amalner Town', nameMr: 'अमळनेर शहर' });
    expect(res.status).toBe(200);
    expect(res.body.branch.name).toBe('Amalner Town');
    expect((await FamilyModel.findById(family.familyId).lean())?.place).toBe('Amalner Town');
  });

  it('only removes empty branches', async () => {
    await createFamily(branches.amalner);
    expect((await api.delete(`/api/branches/${branches.district}`).set('Cookie', admin)).status).toBe(409);
    expect((await api.delete(`/api/branches/${branches.amalner}`).set('Cookie', admin)).status).toBe(409);

    const empty = (await api.post('/api/branches').set('Cookie', admin).send(town(branches.district))).body.branch as Branch;
    expect((await api.delete(`/api/branches/${empty.id}`).set('Cookie', admin)).status).toBe(204);
  });

  it('reports family and sub-branch counts to admins', async () => {
    await createFamily(branches.amalner);
    await createFamily(branches.amalner);
    const items = (await api.get('/api/branches/summary').set('Cookie', admin)).body.items as BranchSummary[];
    const byName = Object.fromEntries(items.map((b) => [b.name, b]));
    expect(byName.Amalner).toMatchObject({ familyCount: 2, childCount: 0 });
    expect(byName['Jalgaon District']).toMatchObject({ childCount: 2 });
  });

  it('is closed to committee members and ordinary members', async () => {
    for (const role of ['committee', 'member'] as const) {
      const { cookie } = await createFamily(branches.district, { account: role });
      expect((await api.post('/api/branches').set('Cookie', cookie).send(town(branches.district))).status).toBe(403);
      expect((await api.get('/api/branches/summary').set('Cookie', cookie)).status).toBe(403);
    }
  });
});
