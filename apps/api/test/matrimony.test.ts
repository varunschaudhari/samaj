import type { GotraId, InterestItem, MyMatrimony, ProfileDetail, ProfilePage } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InterestModel } from '../src/models/interest.model';
import { ProfileModel } from '../src/models/profile.model';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

const year = new Date().getFullYear();
let branches: Awaited<ReturnType<typeof seedBranches>>;
let committee: string;
let admin: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  committee = (await createFamily(branches.district, { account: 'committee', people: [{ name: 'Committee Person' }] })).cookie;
  admin = (await createFamily(branches.pune, { account: 'admin', people: [{ name: 'Admin Person' }] })).cookie;
});

const fields = (contactName = 'Parent Name') => ({
  heightCm: '170',
  education: 'B.E. Computer',
  occupation: 'Engineer',
  income: '6to10',
  manglik: 'no',
  about: 'Works in Pune, enjoys cricket.',
  expectations: 'Educated, family-minded.',
  contactName,
  contactPhone: '98220 11111',
});

/** A verified family with an account (the head) and one grown child. */
async function familyWithChild(branchId: string, child: { name: string; gender: 'male' | 'female'; age: number }, gotra: GotraId | null = 'kashyap') {
  const family = await createFamily(branchId, {
    account: 'member',
    gotra,
    people: [
      { name: `${child.name} Parent` },
      { name: child.name, relation: child.gender === 'male' ? 'son' : 'daughter', gender: child.gender, birthYear: year - child.age },
    ],
  });
  return { ...family, childId: family.memberIds[1] ?? '' };
}

async function liveProfile(fam: Awaited<ReturnType<typeof familyWithChild>>) {
  const created = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId, consent: true });
  expect(created.status).toBe(201);
  const id = (created.body.profile as ProfileDetail).id;
  // An admin approves, so fixtures can live in any branch.
  expect((await api.post(`/api/matrimony/profiles/${id}/approve`).set('Cookie', admin)).status).toBe(200);
  return id;
}

describe('creating a profile', () => {
  it('lists who is eligible, and starts new profiles waiting for the committee', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 });
    const mine = (await api.get('/api/matrimony/mine').set('Cookie', fam.cookie)).body as MyMatrimony;
    expect(mine.eligible.map((e) => e.name)).toEqual(['Rohit Wagh']);

    const res = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId, consent: true });
    expect(res.status).toBe(201);
    expect(res.body.profile).toMatchObject({ name: 'Rohit Wagh', age: 27, status: 'pending', contact: { phone: '+919822011111' } });
  });

  it('requires consent, legal age and a birth year', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Young Son', gender: 'male', age: 19 });
    const noConsent = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId });
    expect(noConsent.body.error.issues).toContainEqual({ path: 'consent', message: 'validation.consent' });

    const young = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId, consent: true });
    expect(young.body.error.issues).toEqual([{ path: 'memberId', message: 'validation.profileTooYoung' }]);

    const mine = (await api.get('/api/matrimony/mine').set('Cookie', fam.cookie)).body as MyMatrimony;
    expect(mine.ineligible).toContainEqual(expect.objectContaining({ name: 'Young Son', reason: 'tooYoung' }));
  });

  it('only for verified families, and only by the family itself', async () => {
    const pending = await createFamily(branches.amalner, { status: 'pending', account: 'member', people: [{ name: 'P' }, { name: 'Pending Son', gender: 'male', birthYear: year - 26 }] });
    const res = await api.post('/api/matrimony/profiles').set('Cookie', pending.cookie).send({ ...fields(), memberId: pending.memberIds[1], consent: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_VERIFIED');

    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 });
    const outsider = await familyWithChild(branches.pune, { name: 'Other', gender: 'female', age: 25 });
    const res2 = await api.post('/api/matrimony/profiles').set('Cookie', outsider.cookie).send({ ...fields(), memberId: fam.childId, consent: true });
    expect(res2.status).toBe(403);
  });

  it("keeps pending profiles out of other families' sight", async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 });
    const created = (await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId, consent: true })).body.profile as ProfileDetail;
    const other = await familyWithChild(branches.amalner, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    expect((await api.get(`/api/matrimony/profiles/${created.id}`).set('Cookie', other.cookie)).status).toBe(404);
  });
});

describe('committee review', () => {
  it('committee approves in its branch, not its own family, and can remove with a note', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 });
    const created = (await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId, consent: true })).body.profile as ProfileDetail;

    const queue = await api.get('/api/matrimony/review').set('Cookie', committee);
    expect(queue.body.items.map((p: { id: string }) => p.id)).toEqual([created.id]);
    expect((await api.get('/api/verifications/count').set('Cookie', committee)).body).toMatchObject({ profiles: 1 });

    const elsewhere = (await createFamily(branches.pune, { account: 'committee' })).cookie;
    expect((await api.post(`/api/matrimony/profiles/${created.id}/approve`).set('Cookie', elsewhere)).status).toBe(404);
    expect((await api.post(`/api/matrimony/profiles/${created.id}/approve`).set('Cookie', fam.cookie)).status).toBe(403);

    const approved = await api.post(`/api/matrimony/profiles/${created.id}/approve`).set('Cookie', committee);
    expect(approved.body.profile.status).toBe('active');

    const removed = await api.post(`/api/matrimony/profiles/${created.id}/remove`).set('Cookie', committee).send({ reason: 'Photo is not of this person.' });
    expect(removed.body.profile).toMatchObject({ status: 'closed', closeReason: 'removed', moderationNote: 'Photo is not of this person.' });
  });

  it('rejection sends it back to the family, who can resubmit', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 });
    const created = (await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields(), memberId: fam.childId, consent: true })).body.profile as ProfileDetail;
    await api.post(`/api/matrimony/profiles/${created.id}/reject`).set('Cookie', committee).send({ reason: 'Please add education details.' });
    const seen = (await api.get(`/api/matrimony/profiles/${created.id}`).set('Cookie', fam.cookie)).body.profile as ProfileDetail;
    expect(seen).toMatchObject({ status: 'rejected', moderationNote: 'Please add education details.' });
    expect((await api.post(`/api/matrimony/profiles/${created.id}/resubmit`).set('Cookie', fam.cookie)).body.profile.status).toBe('pending');
  });
});

describe('search', () => {
  it('shows the opposite gender, never the same gotra or own family, with age and branch filters', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const groomId = await liveProfile(groom);
    await liveProfile(await familyWithChild(branches.bhusawal, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri'));
    await liveProfile(await familyWithChild(branches.pune, { name: 'Komal Bagul', gender: 'female', age: 31 }, null));
    await liveProfile(await familyWithChild(branches.amalner, { name: 'Same Gotra', gender: 'female', age: 25 }, 'kashyap'));
    await liveProfile(await familyWithChild(branches.amalner, { name: 'Another Groom', gender: 'male', age: 28 }, 'atri'));

    const search = async (q = '') => ((await api.get(`/api/matrimony/search?forProfile=${groomId}${q}`).set('Cookie', groom.cookie)).body as ProfilePage).items.map((p) => p.name).sort();
    expect(await search()).toEqual(['Komal Bagul', 'Neha Dhole']);
    expect(await search('&ageMax=28')).toEqual(['Neha Dhole']);
    expect(await search(`&branchId=${branches.district}`)).toEqual(['Neha Dhole']);
    expect(await search('&education=b.e')).toEqual(['Komal Bagul', 'Neha Dhole']);
  });

  it('only searches from your own live profile', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 });
    const bride = await familyWithChild(branches.bhusawal, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    const brideId = await liveProfile(bride);
    expect((await api.get(`/api/matrimony/search?forProfile=${brideId}`).set('Cookie', groom.cookie)).status).toBe(403);
  });
});

describe('interests', () => {
  it('shares contact details only after the other family accepts', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const bride = await familyWithChild(branches.bhusawal, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    const groomId = await liveProfile(groom);
    const brideId = await liveProfile(bride);

    const before = (await api.get(`/api/matrimony/profiles/${brideId}`).set('Cookie', groom.cookie)).body.profile as ProfileDetail;
    expect(before.contact).toBeUndefined();
    expect(before.photoUrl).toBeNull();

    const sent = await api.post('/api/matrimony/interests').set('Cookie', groom.cookie).send({ fromProfileId: groomId, toProfileId: brideId });
    expect(sent.status).toBe(201);
    expect((sent.body.interest as InterestItem).contact).toBeUndefined();

    const again = await api.post('/api/matrimony/interests').set('Cookie', groom.cookie).send({ fromProfileId: groomId, toProfileId: brideId });
    expect(again.body.error.issues).toEqual([{ path: 'interest', message: 'validation.interestExists' }]);
    const reverse = await api.post('/api/matrimony/interests').set('Cookie', bride.cookie).send({ fromProfileId: brideId, toProfileId: groomId });
    expect(reverse.body.error.issues[0].message).toBe('validation.interestReverse');

    const received = (await api.get('/api/matrimony/interests').set('Cookie', bride.cookie)).body.items as InterestItem[];
    expect(received[0]).toMatchObject({ sentByViewer: false, status: 'pending', other: { name: 'Rohit Wagh' } });
    expect((await api.post(`/api/matrimony/interests/${received[0]?.id}/accept`).set('Cookie', groom.cookie)).status).toBe(403);
    await api.post(`/api/matrimony/interests/${received[0]?.id}/accept`).set('Cookie', bride.cookie);

    const after = (await api.get(`/api/matrimony/profiles/${brideId}`).set('Cookie', groom.cookie)).body.profile as ProfileDetail;
    expect(after.contact).toEqual({ name: 'Parent Name', phone: '+919822011111' });
    const theirs = (await api.get(`/api/matrimony/profiles/${groomId}`).set('Cookie', bride.cookie)).body.profile as ProfileDetail;
    expect(theirs.contact?.phone).toBe('+919822011111');
  });

  it('refuses same gotra, same gender and paused profiles, even without the search screen', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const groomId = await liveProfile(groom);
    const sameGotra = await liveProfile(await familyWithChild(branches.bhusawal, { name: 'Same Gotra', gender: 'female', age: 24 }, 'kashyap'));
    const man = await liveProfile(await familyWithChild(branches.bhusawal, { name: 'Other Groom', gender: 'male', age: 28 }, 'atri'));
    const brideFam = await familyWithChild(branches.bhusawal, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    const brideId = await liveProfile(brideFam);
    await api.post(`/api/matrimony/profiles/${brideId}/pause`).set('Cookie', brideFam.cookie);

    const send = (to: string) => api.post('/api/matrimony/interests').set('Cookie', groom.cookie).send({ fromProfileId: groomId, toProfileId: to });
    expect((await send(sameGotra)).body.error.issues[0].message).toBe('validation.interestSameGotra');
    expect((await send(man)).body.error.issues[0].message).toBe('validation.interestGender');
    expect((await send(brideId)).status).toBe(404);
  });

  it('marking a profile married hides it from search and withdraws its open interests', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const brideFam = await familyWithChild(branches.bhusawal, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    const groomId = await liveProfile(groom);
    const brideId = await liveProfile(brideFam);
    await api.post('/api/matrimony/interests').set('Cookie', groom.cookie).send({ fromProfileId: groomId, toProfileId: brideId });

    const closed = await api.post(`/api/matrimony/profiles/${brideId}/close`).set('Cookie', brideFam.cookie).send({ reason: 'married' });
    expect(closed.body.profile).toMatchObject({ status: 'closed', closeReason: 'married' });
    expect(await InterestModel.countDocuments({ status: 'pending' })).toBe(0);
    const results = (await api.get(`/api/matrimony/search?forProfile=${groomId}`).set('Cookie', groom.cookie)).body as ProfilePage;
    expect(results.total).toBe(0);
  });

  it('keeps profile copies in sync with the family and member', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    await liveProfile(fam);
    await api.put(`/api/families/${fam.familyId}`).set('Cookie', fam.cookie).send({ place: 'Amalner', gotra: 'atri' });
    expect((await ProfileModel.findOne().lean())?.gotra).toBe('atri');

    await api.delete(`/api/families/${fam.familyId}/members/${fam.childId}`).set('Cookie', fam.cookie);
    expect(await ProfileModel.countDocuments()).toBe(0);
  });
});

describe('adoption and the gotra rule', () => {
  it('keeps an adopted son from his birth family’s gotra as well as his family’s', async () => {
    const birth = await createFamily(branches.bhusawal, { gotra: 'atri', people: [{ name: 'Birth Head' }] });
    const son = await familyWithChild(branches.amalner, { name: 'Adopted Son', gender: 'male', age: 27 }, 'kashyap');
    const marked = await api
      .put(`/api/families/${son.familyId}/members/${son.childId}`)
      .set('Cookie', son.cookie)
      .send({ name: 'Adopted Son', relation: 'son', gender: 'male', birthYear: String(year - 27), adopted: true, birthFamilyId: birth.familyId });
    expect(marked.status).toBe(200);
    expect(marked.body.family.members.find((m: { id: string }) => m.id === son.childId)).toMatchObject({ adopted: true, birthFamily: { id: birth.familyId } });
    const sonProfile = await liveProfile(son);

    const atri = await familyWithChild(branches.amalner, { name: 'Atri Girl', gender: 'female', age: 24 }, 'atri');
    const atriProfile = await liveProfile(atri);
    const garg = await familyWithChild(branches.amalner, { name: 'Garg Girl', gender: 'female', age: 24 }, 'garg');
    await liveProfile(garg);

    const names = async (cookie: string, forProfile: string) => ((await api.get(`/api/matrimony/search?forProfile=${forProfile}`).set('Cookie', cookie)).body as ProfilePage).items.map((p) => p.name);
    expect(await names(son.cookie, sonProfile)).toEqual(['Garg Girl']);
    expect(await names(atri.cookie, atriProfile)).not.toContain('Adopted Son');
    expect((await api.post('/api/matrimony/interests').set('Cookie', son.cookie).send({ fromProfileId: sonProfile, toProfileId: atriProfile })).status).toBe(403);

    // The birth family's gotra changing follows through.
    const birthAdmin = await createFamily(branches.district, { account: 'admin' });
    expect((await api.put(`/api/families/${birth.familyId}`).set('Cookie', birthAdmin.cookie).send({ place: 'Bhusawal', gotra: 'garg', address: '' })).status).toBe(200);
    expect(await names(son.cookie, sonProfile)).toEqual(['Atri Girl']);
  });
});
