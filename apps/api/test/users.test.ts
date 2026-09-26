import type { AdminUserDetail, AdminUserPage } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserModel } from '../src/models/user.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
let admin: Awaited<ReturnType<typeof createFamily>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  admin = await createFamily(branches.pune, { account: 'admin', people: [{ name: 'Asha Admin' }] });
});

const userIdOf = async (familyId: string) => String((await UserModel.findOne({ familyId }).orFail().lean())._id);

describe('GET /api/users', () => {
  it('lists and searches accounts by name or mobile number', async () => {
    await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Kavita Dhole' }] });
    await createFamily(branches.bhusawal, { account: 'committee', people: [{ name: 'Anil Wagh' }] });

    const all = (await api.get('/api/users').set('Cookie', admin.cookie)).body as AdminUserPage;
    expect(all.items.map((u) => u.name)).toEqual(['Anil Wagh', 'Asha Admin', 'Kavita Dhole']);
    expect(all.items[0]).toMatchObject({ role: 'committee', branch: { name: 'Bhusawal' }, familyStatus: 'verified' });

    const byName = (await api.get('/api/users?q=kav').set('Cookie', admin.cookie)).body as AdminUserPage;
    expect(byName.items.map((u) => u.name)).toEqual(['Kavita Dhole']);

    const phone = byName.items[0]?.phone.slice(-6) ?? '';
    const byPhone = (await api.get(`/api/users?q=${phone}`).set('Cookie', admin.cookie)).body as AdminUserPage;
    expect(byPhone.items.map((u) => u.name)).toEqual(['Kavita Dhole']);

    const committee = (await api.get('/api/users?role=committee').set('Cookie', admin.cookie)).body as AdminUserPage;
    expect(committee.items.map((u) => u.name)).toEqual(['Anil Wagh']);
  });

  it('is closed to committee members and members', async () => {
    for (const role of ['committee', 'member'] as const) {
      const { cookie } = await createFamily(branches.district, { account: role });
      expect((await api.get('/api/users').set('Cookie', cookie)).status).toBe(403);
    }
  });
});

describe('PUT /api/users/:id/role', () => {
  it('makes a member committee for a branch, recorded in the history, effective at once', async () => {
    const target = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Kavita Dhole' }] });
    const pending = await createFamily(branches.bhusawal, { status: 'pending' });
    const id = await userIdOf(target.familyId);

    expect((await api.get('/api/verifications').set('Cookie', target.cookie)).status).toBe(403);

    const res = await api.put(`/api/users/${id}/role`).set('Cookie', admin.cookie).send({ role: 'committee', branchId: branches.district });
    expect(res.status).toBe(200);
    const user = res.body.user as AdminUserDetail;
    expect(user).toMatchObject({ role: 'committee', branch: { name: 'Jalgaon District' } });
    expect(user.roleHistory[0]).toMatchObject({ byName: 'Asha Admin', fromRole: 'member', toRole: 'committee', fromBranch: 'Amalner', toBranch: 'Jalgaon District' });

    // Same session, no sign-in needed: the review queue opens and covers the district.
    const queue = await api.get('/api/verifications').set('Cookie', target.cookie);
    expect(queue.status).toBe(200);
    expect(queue.body.items.map((f: { id: string }) => f.id)).toContain(pending.familyId);
  });

  it("doesn't let an admin change their own role", async () => {
    const id = await userIdOf(admin.familyId);
    const res = await api.put(`/api/users/${id}/role`).set('Cookie', admin.cookie).send({ role: 'member', branchId: branches.pune });
    expect(res.status).toBe(403);
  });

  it('lets one of two admins demote the other, after which the remaining admin is the only one', async () => {
    const second = await createFamily(branches.pune, { account: 'admin', people: [{ name: 'Bina Admin' }] });
    const secondId = await userIdOf(second.familyId);
    expect((await api.put(`/api/users/${secondId}/role`).set('Cookie', admin.cookie).send({ role: 'member', branchId: branches.pune })).status).toBe(200);
    expect(await UserModel.countDocuments({ role: 'admin' })).toBe(1);
    // The demoted admin lost access immediately.
    expect((await api.get('/api/users').set('Cookie', second.cookie)).status).toBe(403);
  });

  it('validates the role and branch', async () => {
    const target = await createFamily(branches.amalner, { account: 'member' });
    const id = await userIdOf(target.familyId);
    const bad = await api.put(`/api/users/${id}/role`).set('Cookie', admin.cookie).send({ role: 'owner', branchId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.issues[0]).toEqual({ path: 'role', message: 'validation.role' });
    const noBranch = await api.put(`/api/users/${id}/role`).set('Cookie', admin.cookie).send({ role: 'committee', branchId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(noBranch.body.error.issues[0].path).toBe('branchId');
  });
});
