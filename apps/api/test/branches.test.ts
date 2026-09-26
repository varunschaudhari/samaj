import type { Branch, BranchSummary } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyModel } from '../src/models/family.model';
import { OfficeBearerModel } from '../src/models/office-bearer.model';
import { RoleChangeModel } from '../src/models/role-change.model';
import { UserModel } from '../src/models/user.model';
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

  describe('committee per branch', () => {
    const userOf = async (familyId: string) => UserModel.findOne({ familyId }).orFail().lean();

    it('makes someone committee for a town, lists them, and shows them on the branch', async () => {
      const person = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Kavita Dhole' }] });
      const user = await userOf(person.familyId);

      const res = await api.post(`/api/branches/${branches.amalner}/committee`).set('Cookie', admin).send({ userId: String(user._id), listAs: 'secretary' });
      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({ role: 'committee', branch: { name: 'Amalner' } });
      expect(await RoleChangeModel.countDocuments({ userId: user._id, toRole: 'committee' })).toBe(1);
      expect(await OfficeBearerModel.findOne({ branchId: branches.amalner }).lean()).toMatchObject({ post: 'secretary', name: 'Kavita Dhole', phone: user.phone });

      const items = (await api.get('/api/branches/summary').set('Cookie', admin)).body.items as BranchSummary[];
      expect(items.find((b) => b.name === 'Amalner')?.committee).toEqual([{ userId: String(user._id), name: 'Kavita Dhole', phone: user.phone }]);

      // Adding again doesn't list them twice.
      await api.post(`/api/branches/${branches.amalner}/committee`).set('Cookie', admin).send({ userId: String(user._id), listAs: 'secretary' });
      expect(await OfficeBearerModel.countDocuments({ branchId: branches.amalner })).toBe(1);
    });

    it('removes them: back to member in their own branch, and off the listing', async () => {
      const person = await createFamily(branches.bhusawal, { account: 'member' });
      const user = await userOf(person.familyId);
      await api.post(`/api/branches/${branches.amalner}/committee`).set('Cookie', admin).send({ userId: String(user._id), listAs: 'member' });

      const res = await api.delete(`/api/branches/${branches.amalner}/committee/${user._id}`).set('Cookie', admin);
      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({ role: 'member', branch: { name: 'Bhusawal' } });
      expect(await OfficeBearerModel.countDocuments({ branchId: branches.amalner })).toBe(0);

      // Not on that committee any more.
      expect((await api.delete(`/api/branches/${branches.amalner}/committee/${user._id}`).set('Cookie', admin)).status).toBe(404);
    });

    it("won't turn an admin into committee, and is closed to committee members", async () => {
      const otherAdmin = await createFamily(branches.pune, { account: 'admin' });
      const adminUser = await userOf(otherAdmin.familyId);
      const res = await api.post(`/api/branches/${branches.amalner}/committee`).set('Cookie', admin).send({ userId: String(adminUser._id) });
      expect(res.status).toBe(409);
      expect(res.body.error.issues).toEqual([{ path: 'userId', message: 'validation.alreadyAdmin' }]);

      const committee = (await createFamily(branches.district, { account: 'committee' })).cookie;
      const person = await createFamily(branches.bhusawal, { account: 'member' });
      const user = await userOf(person.familyId);
      expect((await api.post(`/api/branches/${branches.amalner}/committee`).set('Cookie', committee).send({ userId: String(user._id) })).status).toBe(403);
    });
  });
});
