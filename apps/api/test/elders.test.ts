import type { Dashboard, FamilyDetail, FamilyTree, MemberPage } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InviteModel } from '../src/models/invite.model';
import { MemberModel } from '../src/models/member.model';
import { ProfileModel } from '../src/models/profile.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

const family = async (cookie: string, id: string) => (await api.get(`/api/families/${id}`).set('Cookie', cookie)).body.family as FamilyDetail;
const grandfather = { name: 'Ramrao Patil', relation: 'grandfather', gender: 'male', birthYear: '1920', deceased: true, deathYear: '1994' };

describe('elders, and people who have passed away', () => {
  it('adds a late grandfather without consent, keeps him in the family and tree, and out of the directory and counts', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Suresh Patil' }] });
    const committee = await createFamily(branches.district, { account: 'committee' });

    const res = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', committee.cookie).send(grandfather);
    expect(res.status).toBe(201);
    const ramrao = (res.body.family as FamilyDetail).members.find((m) => m.name === 'Ramrao Patil');
    expect(ramrao).toMatchObject({ relation: 'grandfather', deceased: true, deathYear: 1994, birthYear: 1920, canInvite: false, canEditPrivacy: false });
    expect(await MemberModel.findById(ramrao?.id).lean()).toMatchObject({ consentAt: null, phone: null });

    const tree = (await api.get(`/api/families/${own.familyId}/tree`).set('Cookie', own.cookie)).body.tree as FamilyTree;
    expect(tree.households[0]?.members.find((m) => m.name === 'Ramrao Patil')).toMatchObject({ generation: -2, deceased: true, deathYear: 1994 });

    const directory = (await api.get('/api/members?q=ramrao').set('Cookie', own.cookie)).body as MemberPage;
    expect(directory.items).toEqual([]);
    const dashboard = (await api.get('/api/dashboard').set('Cookie', committee.cookie)).body.dashboard as Dashboard;
    // Suresh and the committee member's own head; not Ramrao.
    expect(dashboard.members).toBe(2);
  });

  it('still asks for consent for living people, and checks the years', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const living = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ ...grandfather, deceased: false });
    expect(living.status).toBe(400);
    expect(living.body.error.issues).toContainEqual({ path: 'consent', message: 'validation.consentRequired' });

    const backwards = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ ...grandfather, deathYear: '1910' });
    expect(backwards.body.error.issues).toContainEqual({ path: 'deathYear', message: 'validation.deathBeforeBirth' });

    // An ancestor born before 1900 is fine.
    const great = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ ...grandfather, relation: 'greatGrandfather', birthYear: '1885', deathYear: '1950' });
    expect(great.status).toBe(201);
    // Added by a verified family itself: waits for the committee like anyone else.
    expect((great.body.family as FamilyDetail).members.find((m) => m.relation === 'greatGrandfather')?.approval).toBe('pending');
  });

  it('marking someone as passed away ends their profile and invite, and drops their number', async () => {
    const own = await createFamily(branches.bhusawal, {
      account: 'member',
      people: [{ name: 'Suresh Patil' }, { name: 'Anil Patil', relation: 'brother', birthYear: 1990 }],
    });
    const anilId = own.memberIds[1] ?? '';
    await ProfileModel.create({
      memberId: anilId,
      familyId: own.familyId,
      contactName: 'Suresh Patil',
      contactPhone: '+919822000000',
      status: 'active',
      consentByUserId: new Types.ObjectId(),
      consentAt: new Date(),
      gender: 'male',
      birthYear: 1990,
      branchId: branches.bhusawal,
      branchAncestors: [branches.district],
    });
    expect((await api.post(`/api/families/${own.familyId}/members/${anilId}/invite`).set('Cookie', own.cookie)).status).toBe(201);

    const res = await api
      .put(`/api/families/${own.familyId}/members/${anilId}`)
      .set('Cookie', own.cookie)
      .send({ name: 'Anil Patil', relation: 'brother', gender: 'male', birthYear: '1990', phone: '9822012345', deceased: true, deathYear: '2025' });
    expect(res.status).toBe(200);
    expect((res.body.family as FamilyDetail).members.find((m) => m.id === anilId)).toMatchObject({ deceased: true, deathYear: 2025, canInvite: false });
    expect(await ProfileModel.findOne({ memberId: anilId })).toBeNull();
    expect(await InviteModel.findOne({ memberId: anilId })).toBeNull();
    expect((await MemberModel.findById(anilId).lean())?.phone).toBeNull();
    expect((await api.post(`/api/families/${own.familyId}/members/${anilId}/invite`).set('Cookie', own.cookie)).status).toBe(409);
  });

  it("won't mark the family head as passed away", async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Suresh Patil' }] });
    const headId = own.memberIds[0] ?? '';
    const res = await api
      .put(`/api/families/${own.familyId}/members/${headId}`)
      .set('Cookie', own.cookie)
      .send({ name: 'Suresh Patil', relation: 'head', gender: 'male', deceased: true });
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual([{ path: 'deceased', message: 'validation.deceasedHead' }]);
    expect((await family(own.cookie, own.familyId)).members[0]?.deceased).toBe(false);
  });
});
