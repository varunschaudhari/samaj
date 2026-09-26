import type { FamilyDetail, PendingFamilyPage } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemberModel } from '../src/models/member.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

describe('the review queue', () => {
  it("lists pending families in the committee's branch subtree, oldest first", async () => {
    const first = await createFamily(branches.bhusawal, { status: 'pending', people: [{ name: 'First Family' }, { name: 'Child' }] });
    await createFamily(branches.amalner, { status: 'pending', people: [{ name: 'Second Family' }] });
    await createFamily(branches.pune, { status: 'pending', people: [{ name: 'Pune Family' }] });
    await createFamily(branches.bhusawal, { status: 'verified', people: [{ name: 'Already Verified' }] });
    const committee = await createFamily(branches.district, { status: 'pending', account: 'committee', people: [{ name: 'Committee Own' }] });

    const res = await api.get('/api/verifications').set('Cookie', committee.cookie);
    expect(res.status).toBe(200);
    const page = res.body as PendingFamilyPage;
    expect(page.items.map((f) => f.headName)).toEqual(['First Family', 'Second Family']);
    expect(page.items[0]).toMatchObject({ id: first.familyId, memberCount: 2 });

    const count = await api.get('/api/verifications/count').set('Cookie', committee.cookie);
    expect(count.body).toEqual({ pending: 2 });
  });

  it('is not available to ordinary members', async () => {
    const { cookie } = await createFamily(branches.bhusawal, { account: 'member' });
    expect((await api.get('/api/verifications').set('Cookie', cookie)).status).toBe(403);
    expect((await api.get('/api/verifications/count').set('Cookie', cookie)).body).toEqual({ pending: 0 });
  });
});

describe('verify and reject', () => {
  it('verifies a family, opening the directory to it', async () => {
    const pending = await createFamily(branches.bhusawal, { status: 'pending', account: 'member', people: [{ name: 'New Family' }, { name: 'Child' }] });
    const committee = await createFamily(branches.district, { account: 'committee' });

    expect((await api.get('/api/members').set('Cookie', pending.cookie)).status).toBe(403);
    const res = await api.post(`/api/families/${pending.familyId}/verify`).set('Cookie', committee.cookie);
    expect(res.status).toBe(200);
    expect((res.body.family as FamilyDetail).status).toBe('verified');
    expect((res.body.family as FamilyDetail).history?.[0]).toMatchObject({ action: 'verified' });
    expect(await MemberModel.countDocuments({ familyId: pending.familyId, familyStatus: 'verified' })).toBe(2);

    expect((await api.get('/api/members').set('Cookie', pending.cookie)).status).toBe(200);
    const me = await api.get('/api/auth/me').set('Cookie', pending.cookie);
    expect(me.body.user.familyStatus).toBe('verified');
  });

  it('refuses a second review of the same family', async () => {
    const pending = await createFamily(branches.bhusawal, { status: 'pending' });
    const committee = await createFamily(branches.district, { account: 'committee' });
    await api.post(`/api/families/${pending.familyId}/verify`).set('Cookie', committee.cookie);
    const again = await api.post(`/api/families/${pending.familyId}/reject`).set('Cookie', committee.cookie).send({ reason: 'Duplicate entry' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CONFLICT');
  });

  it("doesn't let committee members review their own family or other branches", async () => {
    const committee = await createFamily(branches.bhusawal, { status: 'pending', account: 'committee' });
    const own = await api.post(`/api/families/${committee.familyId}/verify`).set('Cookie', committee.cookie);
    expect(own.status).toBe(403);

    const elsewhere = await createFamily(branches.pune, { status: 'pending' });
    expect((await api.post(`/api/families/${elsewhere.familyId}/verify`).set('Cookie', committee.cookie)).status).toBe(404);

    const admin = await createFamily(branches.pune, { status: 'pending', account: 'admin' });
    expect((await api.post(`/api/families/${admin.familyId}/verify`).set('Cookie', admin.cookie)).status).toBe(200);
  });

  it('rejects with a reason, and the family can fix and resubmit', async () => {
    const pending = await createFamily(branches.bhusawal, { status: 'pending', account: 'member' });
    const committee = await createFamily(branches.district, { account: 'committee' });

    const short = await api.post(`/api/families/${pending.familyId}/reject`).set('Cookie', committee.cookie).send({ reason: 'no' });
    expect(short.body.error.issues[0].message).toBe('validation.reasonMin');

    const rejected = await api.post(`/api/families/${pending.familyId}/reject`).set('Cookie', committee.cookie).send({ reason: 'Add the correct village name.' });
    expect(rejected.body.family).toMatchObject({ status: 'rejected', rejectionReason: 'Add the correct village name.' });

    const seen = (await api.get(`/api/families/${pending.familyId}`).set('Cookie', pending.cookie)).body.family as FamilyDetail;
    expect(seen.permissions.canResubmit).toBe(true);

    const back = await api.post(`/api/families/${pending.familyId}/resubmit`).set('Cookie', pending.cookie);
    expect(back.body.family.status).toBe('pending');
    const queue = (await api.get('/api/verifications').set('Cookie', committee.cookie)).body as PendingFamilyPage;
    expect(queue.items.map((f) => f.id)).toContain(pending.familyId);
  });
});
