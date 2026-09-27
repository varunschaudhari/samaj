import type { FamilyDetail } from '@samaj/shared';
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

const son = { name: 'Rohit Wagh', relation: 'son', gender: 'male', birthYear: '1995', occupation: 'Engineer', education: 'B.E.', phone: '', consent: true };
// Smallest valid JPEG header is enough: the API checks magic bytes, not the full image.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

describe('GET /api/families/:id', () => {
  it('shows your own family with contact details and history, even while pending', async () => {
    const own = await createFamily(branches.bhusawal, { status: 'pending', account: 'member', people: [{ name: 'Anil Wagh' }] });
    const res = await api.get(`/api/families/${own.familyId}`).set('Cookie', own.cookie);
    expect(res.status).toBe(200);
    const family = res.body.family as FamilyDetail;
    expect(family).toMatchObject({ status: 'pending', headName: 'Anil Wagh', permissions: { canEdit: true, canReview: false } });
    expect(family.members[0]?.phone).toMatch(/^\+91/);
    expect(family.history?.[0]?.action).toBe('created');
  });

  it("hides another verified family's contacts and history from ordinary members", async () => {
    const other = await createFamily(branches.amalner);
    const { cookie } = await createFamily(branches.pune, { account: 'member' });
    const family = (await api.get(`/api/families/${other.familyId}`).set('Cookie', cookie)).body.family as FamilyDetail;
    expect(family.members[0]).not.toHaveProperty('phone');
    expect(family).not.toHaveProperty('address');
    expect(family).not.toHaveProperty('history');
    expect(family.permissions.canEdit).toBe(false);
  });

  it('reports pending families outside your reach as not found', async () => {
    const pending = await createFamily(branches.amalner, { status: 'pending' });
    const { cookie } = await createFamily(branches.pune, { account: 'member' });
    expect((await api.get(`/api/families/${pending.familyId}`).set('Cookie', cookie)).status).toBe(404);
    expect((await api.get('/api/families/not-an-id').set('Cookie', cookie)).status).toBe(404);
  });
});

describe('editing a family', () => {
  it('lets the family add, edit and remove its members', async () => {
    const own = await createFamily(branches.bhusawal, { status: 'pending', account: 'member', people: [{ name: 'Anil Wagh' }] });

    const added = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send(son);
    expect(added.status).toBe(201);
    const rohit = (added.body.family as FamilyDetail).members.find((m) => m.name === 'Rohit Wagh');
    expect(rohit).toMatchObject({ relation: 'son', birthYear: 1995, phone: null, isHead: false, hasAccount: false });

    const edited = await api
      .put(`/api/families/${own.familyId}/members/${rohit?.id}`)
      .set('Cookie', own.cookie)
      .send({ ...son, occupation: 'Doctor', phone: '98220 55555' });
    const after = (edited.body.family as FamilyDetail).members.find((m) => m.id === rohit?.id);
    expect(after).toMatchObject({ occupation: 'Doctor', phone: '+919822055555' });

    const removed = await api.delete(`/api/families/${own.familyId}/members/${rohit?.id}`).set('Cookie', own.cookie);
    expect((removed.body.family as FamilyDetail).members).toHaveLength(1);
    expect((removed.body.family as FamilyDetail).history?.[0]?.note).toBe('Removed Rohit Wagh');
  });

  it('keeps members in sync when the family place or gotra changes', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh' }] });
    const res = await api.put(`/api/families/${own.familyId}`).set('Cookie', own.cookie).send({ place: 'Varangaon', gotra: 'kashyap', address: 'Near the temple' });
    expect(res.status).toBe(200);
    expect(res.body.family).toMatchObject({ place: 'Varangaon', gotra: 'kashyap', address: 'Near the temple' });
    expect(await MemberModel.countDocuments({ familyId: own.familyId, place: 'Varangaon', gotra: 'kashyap' })).toBe(2);
  });

  it('only accepts gotras from the fixed list', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const res = await api.put(`/api/families/${own.familyId}`).set('Cookie', own.cookie).send({ place: 'Bhusawal', gotra: 'Kashyapa' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual([{ path: 'gotra', message: 'validation.gotra' }]);
    const cleared = await api.put(`/api/families/${own.familyId}`).set('Cookie', own.cookie).send({ place: 'Bhusawal', gotra: '' });
    expect(cleared.body.family.gotra).toBeNull();
  });

  it('refuses a second head, and removing the head', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const second = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ ...son, relation: 'head' });
    expect(second.status).toBe(400);
    expect(second.body.error.issues).toEqual([{ path: 'relation', message: 'validation.relationHead' }]);
    const removeHead = await api.delete(`/api/families/${own.familyId}/members/${own.memberIds[0]}`).set('Cookie', own.cookie);
    expect(removeHead.status).toBe(400);
  });

  it('validates member fields with translatable keys', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const res = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ name: 'R', relation: 'cousin', gender: 'male', birthYear: '95', consent: true });
    const byPath = Object.fromEntries(res.body.error.issues.map((i: { path: string; message: string }) => [i.path, i.message]));
    expect(byPath).toEqual({ name: 'validation.nameMin', relation: 'validation.relation', birthYear: 'validation.birthYear' });
  });

  it('lets the branch committee edit, but not other members or other branches', async () => {
    const target = await createFamily(branches.bhusawal);
    const url = `/api/families/${target.familyId}/members`;
    const committee = await createFamily(branches.district, { account: 'committee' });
    const otherCommittee = await createFamily(branches.pune, { account: 'committee' });
    const member = await createFamily(branches.bhusawal, { account: 'member' });

    expect((await api.post(url).set('Cookie', committee.cookie).send(son)).status).toBe(201);
    expect((await api.post(url).set('Cookie', member.cookie).send(son)).status).toBe(403);
    expect((await api.post(url).set('Cookie', otherCommittee.cookie).send(son)).status).toBe(403);
  });
});

describe('photos', () => {
  it('uploads, serves and replaces a photo', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const memberId = own.memberIds[0];
    const up = await api.put(`/api/families/${own.familyId}/members/${memberId}/photo`).set('Cookie', own.cookie).set('Content-Type', 'image/jpeg').send(JPEG);
    expect(up.status).toBe(200);
    const url = (up.body.family as FamilyDetail).members[0]?.photoUrl;
    expect(url).toMatch(new RegExp(`^/api/members/${memberId}/photo\\?v=1$`));

    const img = await api.get(url ?? '').set('Cookie', own.cookie);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/jpeg');

    const again = await api.put(`/api/families/${own.familyId}/members/${memberId}/photo`).set('Cookie', own.cookie).set('Content-Type', 'image/jpeg').send(JPEG);
    expect((again.body.family as FamilyDetail).members[0]?.photoUrl).toMatch(/v=2$/);
  });

  it('rejects files that are not images, whatever the header says', async () => {
    const own = await createFamily(branches.bhusawal, { account: 'member' });
    const res = await api
      .put(`/api/families/${own.familyId}/members/${own.memberIds[0]}/photo`)
      .set('Cookie', own.cookie)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('<script>alert(1)</script>'));
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].message).toBe('validation.photoType');
  });

  it("doesn't serve a pending family's photos to outsiders", async () => {
    const own = await createFamily(branches.bhusawal, { status: 'pending', account: 'member' });
    await api.put(`/api/families/${own.familyId}/members/${own.memberIds[0]}/photo`).set('Cookie', own.cookie).set('Content-Type', 'image/jpeg').send(JPEG);
    const outsider = await createFamily(branches.pune, { account: 'member' });
    expect((await api.get(`/api/members/${own.memberIds[0]}/photo`).set('Cookie', outsider.cookie)).status).toBe(404);
  });
});
