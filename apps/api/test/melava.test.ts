import type { GotraId, MelavaDetail, ProfileDetail, ProfilePage } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, clearDb, completeProfile, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

const year = new Date().getFullYear();
let branches: Awaited<ReturnType<typeof seedBranches>>;
let admin: string;
let committee: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  admin = (await createFamily(branches.pune, { account: 'admin', people: [{ name: 'Admin Person' }] })).cookie;
  committee = (await createFamily(branches.district, { account: 'committee', people: [{ name: 'Committee Person' }] })).cookie;
});

async function familyWithChild(branchId: string, child: { name: string; gender: 'male' | 'female'; age: number }, gotra: GotraId | null) {
  const family = await createFamily(branchId, {
    account: 'member',
    gotra,
    people: [
      { name: `${child.name} Parent` },
      { name: child.name, relation: child.gender === 'male' ? 'son' : 'daughter', gender: child.gender, birthYear: year - child.age },
    ],
  });
  return { ...family, childId: family.memberIds[1] ?? '', birthYear: year - child.age };
}
type Fam = Awaited<ReturnType<typeof familyWithChild>>;

const create = (fam: Fam, fields: Record<string, unknown>) => api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...fields, memberId: fam.childId, consent: true });

async function liveProfile(fam: Fam, overrides: Record<string, unknown> = {}) {
  const res = await create(fam, completeProfile(fam.birthYear, overrides));
  expect(res.status).toBe(201);
  const id = (res.body.profile as ProfileDetail).id;
  expect((await api.post(`/api/matrimony/profiles/${id}/approve`).set('Cookie', admin)).status).toBe(200);
  return id;
}

describe('drafts and the required fields', () => {
  it('saves an incomplete draft, lists what is missing, and sends it once complete', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const draft = await create(fam, { contactName: 'Parent', contactPhone: '98220 11111', heightCm: '170' });
    expect(draft.status).toBe(201);
    const profile = draft.body.profile as ProfileDetail;
    expect(profile.status).toBe('draft');
    expect(profile.missing).toEqual(expect.arrayContaining(['surname', 'birthDate', 'mamaKul', 'pincode', 'parentWhatsapp']));
    expect(profile.missing).not.toContain('heightCm');

    // Not in the committee's queue, not visible to other families.
    expect((await api.get('/api/matrimony/review').set('Cookie', committee)).body.items).toHaveLength(0);
    const other = await familyWithChild(branches.amalner, { name: 'Neha', gender: 'female', age: 24 }, 'atri');
    expect((await api.get(`/api/matrimony/profiles/${profile.id}`).set('Cookie', other.cookie)).status).toBe(404);

    const early = await api.post(`/api/matrimony/profiles/${profile.id}/submit`).set('Cookie', fam.cookie);
    expect(early.status).toBe(400);
    expect(early.body.error.issues).toContainEqual({ path: 'mamaKul', message: 'validation.required' });

    const { submit: _s, ...fields } = completeProfile(fam.birthYear);
    expect((await api.put(`/api/matrimony/profiles/${profile.id}`).set('Cookie', fam.cookie).send(fields)).body.profile.missing).toEqual([]);
    const sent = await api.post(`/api/matrimony/profiles/${profile.id}/submit`).set('Cookie', fam.cookie);
    expect(sent.body.profile.status).toBe('pending');
  });

  it('refuses to send straight to the committee when details are missing', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const res = await create(fam, completeProfile(fam.birthYear, { pincode: '', mamaKul: '' }));
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual([
      { path: 'mamaKul', message: 'validation.required' },
      { path: 'pincode', message: 'validation.required' },
    ]);
  });

  it('needs a kul on the family page, an exact time or a band, and a description when disability is ticked', async () => {
    const noKul = await familyWithChild(branches.amalner, { name: 'No Kul', gender: 'male', age: 27 }, null);
    const res = await create(noKul, completeProfile(noKul.birthYear, { submit: false, birthTimeOfDay: '', birthTime: '06:45', hasDisability: true }));
    expect(res.body.profile.missing).toEqual(['gotra', 'disabilityDetail']);
  });

  it('checks pincodes and phone numbers', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const res = await create(fam, completeProfile(fam.birthYear, { pincode: '1234', parentWhatsapp: '12345' }));
    expect(res.body.error.issues).toEqual(
      expect.arrayContaining([
        { path: 'pincode', message: 'validation.pincode' },
        { path: 'parentWhatsapp', message: 'validation.phone' },
      ]),
    );
  });
});

describe('monthly income', () => {
  async function pair(visibility: string) {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const bride = await familyWithChild(branches.pune, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    const groomId = await liveProfile(groom, { monthlyIncome: '45,000', incomeVisibility: visibility });
    const brideId = await liveProfile(bride);
    const view = async (cookie: string) => (await api.get(`/api/matrimony/profiles/${groomId}`).set('Cookie', cookie)).body.profile as ProfileDetail;
    return { groom, bride, groomId, brideId, view };
  }

  it('shows the exact amount only to the family and the committee', async () => {
    const { groom, bride, view } = await pair('everyone');
    expect(await view(groom.cookie)).toMatchObject({ monthlyIncome: 45_000, incomeBand: '25to50' });
    expect(await view(admin)).toMatchObject({ monthlyIncome: 45_000 });
    const other = await view(bride.cookie);
    expect(other.incomeBand).toBe('25to50');
    expect(other).not.toHaveProperty('monthlyIncome');
  });

  it('shows the band after an accepted interest, or never, as the family chose', async () => {
    const accepted = await pair('accepted');
    expect((await accepted.view(accepted.bride.cookie)).incomeBand).toBeNull();
    const sent = await api.post('/api/matrimony/interests').set('Cookie', accepted.bride.cookie).send({ fromProfileId: accepted.brideId, toProfileId: accepted.groomId });
    await api.post(`/api/matrimony/interests/${sent.body.interest.id}/accept`).set('Cookie', accepted.groom.cookie);
    expect((await accepted.view(accepted.bride.cookie)).incomeBand).toBe('25to50');
  });

  it('keeps it hidden when the family says so', async () => {
    const hidden = await pair('hidden');
    expect((await hidden.view(hidden.bride.cookie)).incomeBand).toBeNull();
    expect((await hidden.view(hidden.groom.cookie)).incomeBand).toBe('25to50');
  });
});

describe("the maternal uncle's kul", () => {
  it('keeps matches away from it both ways, in search and in interests', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const groomId = await liveProfile(groom, { mamaKul: 'gautam' });

    // Her kul is his mama's kul.
    const hisMama = await familyWithChild(branches.pune, { name: 'Gautam Bride', gender: 'female', age: 24 }, 'gautam');
    const hisMamaId = await liveProfile(hisMama, { mamaKul: 'atri' });
    // Her mama's kul is his kul.
    const herMama = await familyWithChild(branches.pune, { name: 'Mama Kashyap', gender: 'female', age: 24 }, 'garg');
    await liveProfile(herMama, { mamaKul: 'kashyap' });
    const fine = await familyWithChild(branches.pune, { name: 'No Clash', gender: 'female', age: 24 }, 'atri');
    await liveProfile(fine, { mamaKul: 'garg' });

    const found = ((await api.get(`/api/matrimony/search?forProfile=${groomId}`).set('Cookie', groom.cookie)).body as ProfilePage).items.map((p) => p.name);
    expect(found).toEqual(['No Clash']);

    const refused = await api.post('/api/matrimony/interests').set('Cookie', hisMama.cookie).send({ fromProfileId: hisMamaId, toProfileId: groomId });
    expect(refused.status).toBe(403);
    expect(refused.body.error.issues).toEqual([{ path: 'interest', message: 'validation.mamaKulClash' }]);
  });
});

describe('melava', () => {
  const melavaBody = (branchId: string, extra: Record<string, unknown> = {}) => ({
    name: 'Jalgaon Vadhu-Var Parichay Melava',
    date: `${year + 1}-01-15`,
    venue: 'Samaj Hall, Jalgaon',
    branchId,
    fee: 500,
    paymentInstructions: 'UPI: samaj@upi',
    ...extra,
  });
  const newMelava = async (cookie: string, extra: Record<string, unknown> = {}) => api.post('/api/melavas').set('Cookie', cookie).send(melavaBody(branches.district, extra));

  it('is organised by that branch’s committee or an admin', async () => {
    const member = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const puneCommittee = (await createFamily(branches.pune, { account: 'committee' })).cookie;
    expect((await newMelava(member.cookie)).status).toBe(403);
    expect((await newMelava(puneCommittee)).status).toBe(403);
    const made = await newMelava(committee);
    expect(made.status).toBe(201);
    expect(made.body.melava).toMatchObject({ fee: 500, registrationOpen: true, permissions: { canManage: true }, counts: { bride: 0, groom: 0 } });
    expect((await newMelava(admin)).status).toBe(201);

    // Every verified family sees it, but only organisers see everyone's registrations.
    const listed = await api.get('/api/melavas').set('Cookie', member.cookie);
    expect(listed.body.items).toHaveLength(2);
    const seen = (await api.get(`/api/melavas/${made.body.melava.id}`).set('Cookie', member.cookie)).body.melava as MelavaDetail;
    expect(seen.permissions.canManage).toBe(false);
    expect(seen).not.toHaveProperty('registrations');
  });

  it('registers complete profiles, and numbers each sequence as payments are verified', async () => {
    const melavaId = (await newMelava(committee)).body.melava.id as string;
    const brideA = await familyWithChild(branches.amalner, { name: 'Bride A', gender: 'female', age: 24 }, 'atri');
    const brideB = await familyWithChild(branches.bhusawal, { name: 'Bride B', gender: 'female', age: 25 }, 'garg');
    const groom = await familyWithChild(branches.pune, { name: 'Groom A', gender: 'male', age: 28 }, 'kashyap');
    const ids = { a: await liveProfile(brideA), b: await liveProfile(brideB), g: await liveProfile(groom) };

    const reg = (fam: Fam, profileId: string) => api.post(`/api/melavas/${melavaId}/registrations`).set('Cookie', fam.cookie).send({ profileId, paymentRef: `UPI-${profileId.slice(-6)}` });
    expect((await reg(brideA, ids.a)).status).toBe(201);
    expect((await reg(brideA, ids.a)).body.error.issues).toEqual([{ path: 'profileId', message: 'validation.melavaRegistered' }]);
    expect((await reg(brideA, ids.b)).status).toBe(403);
    await reg(brideB, ids.b);
    const mine = (await reg(groom, ids.g)).body.melava as MelavaDetail;
    expect(mine.mine).toEqual([expect.objectContaining({ status: 'pendingPayment', candidateType: 'groom', candidateNumber: null })]);

    const all = ((await api.get(`/api/melavas/${melavaId}`).set('Cookie', committee)).body.melava as MelavaDetail).registrations ?? [];
    const byName = (n: string) => all.find((r) => r.profile.name === n)?.id ?? '';
    const verify = (id: string) => api.post(`/api/melavas/${melavaId}/registrations/${id}/verify`).set('Cookie', committee);
    expect((await api.post(`/api/melavas/${melavaId}/registrations/${byName('Groom A')}/verify`).set('Cookie', groom.cookie)).status).toBe(403);
    await verify(byName('Bride B'));
    await verify(byName('Groom A'));
    const done = (await verify(byName('Bride A'))).body.melava as MelavaDetail;
    expect(done.registrations?.map((r) => [r.profile.name, r.candidateType, r.candidateNumber])).toEqual([
      ['Bride B', 'bride', 1],
      ['Bride A', 'bride', 2],
      ['Groom A', 'groom', 1],
    ]);
    expect(done.counts).toEqual({ bride: 2, groom: 1 });
    // A second click can't take another number.
    expect((await verify(byName('Bride A'))).status).toBe(409);
  });

  it('only takes complete profiles that were sent for approval, while registration is open', async () => {
    const melavaId = (await newMelava(committee)).body.melava.id as string;
    const fam = await familyWithChild(branches.amalner, { name: 'Draft Son', gender: 'male', age: 27 }, 'kashyap');
    const draftId = (await create(fam, { contactName: 'Parent', contactPhone: '98220 11111' })).body.profile.id as string;
    const res = await api.post(`/api/melavas/${melavaId}/registrations`).set('Cookie', fam.cookie).send({ profileId: draftId, paymentRef: 'UPI-1234' });
    expect(res.body.error.issues).toEqual([{ path: 'profileId', message: 'validation.melavaProfile' }]);

    const closedId = (await newMelava(committee, { registrationOpen: false })).body.melava.id as string;
    const live = await familyWithChild(branches.amalner, { name: 'Live Son', gender: 'male', age: 27 }, 'kashyap');
    const liveId = await liveProfile(live);
    const closed = await api.post(`/api/melavas/${closedId}/registrations`).set('Cookie', live.cookie).send({ profileId: liveId, paymentRef: 'UPI-1234' });
    expect(closed.body.error.issues).toEqual([{ path: 'melava', message: 'validation.melavaClosed' }]);
  });

  it('lets the family cancel while unpaid, and register again later', async () => {
    const melavaId = (await newMelava(committee)).body.melava.id as string;
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const profileId = await liveProfile(fam);
    const first = (await api.post(`/api/melavas/${melavaId}/registrations`).set('Cookie', fam.cookie).send({ profileId, paymentRef: 'UPI-1' })).body.melava as MelavaDetail;
    const regId = first.mine[0]?.id ?? '';
    const cancelled = (await api.post(`/api/melavas/${melavaId}/registrations/${regId}/cancel`).set('Cookie', fam.cookie).send({ reason: 'Wrong payment' })).body.melava as MelavaDetail;
    expect(cancelled.mine[0]?.status).toBe('cancelled');
    const again = (await api.post(`/api/melavas/${melavaId}/registrations`).set('Cookie', fam.cookie).send({ profileId, paymentRef: 'UPI-2' })).body.melava as MelavaDetail;
    expect(again.mine).toEqual([expect.objectContaining({ status: 'pendingPayment', paymentRef: 'UPI-2' })]);

    await api.post(`/api/melavas/${melavaId}/registrations/${regId}/verify`).set('Cookie', committee);
    expect((await api.post(`/api/melavas/${melavaId}/registrations/${regId}/cancel`).set('Cookie', fam.cookie).send({ reason: 'Changed mind' })).status).toBe(403);
  });

  it('exports the verified list for the booklet, to organisers only', async () => {
    const melavaId = (await newMelava(committee)).body.melava.id as string;
    const fam = await familyWithChild(branches.amalner, { name: 'Neha Dhole', gender: 'female', age: 24 }, 'atri');
    const profileId = await liveProfile(fam, { surname: 'Dhole', firstName: 'Neha', fatherName: 'Vijay', mamaKul: 'garg' });
    const reg = (await api.post(`/api/melavas/${melavaId}/registrations`).set('Cookie', fam.cookie).send({ profileId, paymentRef: 'UPI-9' })).body.melava as MelavaDetail;
    await api.post(`/api/melavas/${melavaId}/registrations/${reg.mine[0]?.id}/verify`).set('Cookie', committee);

    expect((await api.get(`/api/melavas/${melavaId}/export.csv`).set('Cookie', fam.cookie)).status).toBe(403);
    const csv = await api.get(`/api/melavas/${melavaId}/export.csv`).set('Cookie', committee);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const [header, row] = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(header?.split(',').slice(0, 6)).toEqual(['क्रमांक', 'वधू/वर', 'आडनाव', 'नाव', 'वडिलांचे नाव', 'कुल']);
    expect(row).toMatch(/^1,वधू,Dhole,Neha,Vijay,अत्रि,/);
    expect(row).toContain('गर्ग');

    const english = await api.get(`/api/melavas/${melavaId}/export.csv?lang=en`).set('Cookie', committee);
    expect(english.text).toContain('Surname');
  });
});

describe('registering at the office', () => {
  const melavaBody = (branchId: string) => ({ name: 'Jalgaon Melava', date: `${year + 1}-01-15`, branchId, fee: 500 });

  /** The committee enrols a walk-in family, adds the son, and fills in his profile from the paper form. */
  async function walkIn(committeeCookie: string, branchId: string, fields: Record<string, unknown>) {
    const family = await api
      .post('/api/families')
      .set('Cookie', committeeCookie)
      .send({ branchId, place: '', gotra: 'atri', address: '', consent: true, head: { name: 'Vasant Mahajan', gender: 'male', birthYear: '1965', phone: '98220 55555' } });
    expect(family.status).toBe(201);
    const familyId = family.body.family.id as string;
    const added = await api
      .post(`/api/families/${familyId}/members`)
      .set('Cookie', committeeCookie)
      .send({ name: 'Sagar Mahajan', relation: 'son', gender: 'male', birthYear: String(year - 27), consent: true });
    expect(added.status).toBe(201);
    const son = (added.body.family.members as { id: string; name: string }[]).find((m) => m.name === 'Sagar Mahajan');
    const created = await api
      .post('/api/matrimony/profiles')
      .set('Cookie', committeeCookie)
      .send({ ...completeProfile(year - 27, { submit: false, ...fields }), memberId: son?.id, consent: true });
    expect(created.status).toBe(201);
    return { familyId, profileId: created.body.profile.id as string, profile: created.body.profile as ProfileDetail };
  }

  it('finds a walk-in family, and registers them paid with a number on the spot', async () => {
    const melavaId = (await api.post('/api/melavas').set('Cookie', committee).send(melavaBody(branches.district))).body.melava.id as string;
    const { profileId, profile } = await walkIn(committee, branches.amalner, {});
    expect(profile.status).toBe('draft');

    const found = await api.get(`/api/melavas/${melavaId}/office-search?q=sagar`).set('Cookie', committee);
    expect(found.body.items).toEqual([expect.objectContaining({ name: 'Sagar Mahajan', familyHead: 'Vasant Mahajan', profile: { id: profileId, status: 'draft', missing: [] }, registration: null })]);
    // By mobile too: the number on the profile.
    const byPhone = await api.get(`/api/melavas/${melavaId}/office-search?q=9822011111`).set('Cookie', committee);
    expect(byPhone.body.items.map((c: { name: string }) => c.name)).toContain('Sagar Mahajan');

    const res = await api.post(`/api/melavas/${melavaId}/office-registrations`).set('Cookie', committee).send({ profileId, paid: true, paymentRef: 'Receipt 104' });
    expect(res.status).toBe(201);
    const reg = (res.body.melava as MelavaDetail).registrations?.[0];
    expect(reg).toMatchObject({ status: 'verified', candidateType: 'groom', candidateNumber: 1, paymentRef: 'Receipt 104' });
    // Registering sent the completed draft to the committee.
    expect((await api.get(`/api/matrimony/profiles/${profileId}`).set('Cookie', committee)).body.profile.status).toBe('pending');
    // And the search now shows it as registered.
    const after = await api.get(`/api/melavas/${melavaId}/office-search?q=sagar`).set('Cookie', committee);
    expect(after.body.items[0].registration).toMatchObject({ status: 'verified', candidateNumber: 1 });
  });

  it('can leave the payment for later, and still needs a complete profile', async () => {
    const melavaId = (await api.post('/api/melavas').set('Cookie', committee).send(melavaBody(branches.district))).body.melava.id as string;
    const { profileId } = await walkIn(committee, branches.amalner, { mamaKul: '' });
    const incomplete = await api.post(`/api/melavas/${melavaId}/office-registrations`).set('Cookie', committee).send({ profileId, paid: false });
    expect(incomplete.body.error.issues).toEqual([{ path: 'mamaKul', message: 'validation.required' }]);

    await api.put(`/api/matrimony/profiles/${profileId}`).set('Cookie', committee).send(completeProfile(year - 27));
    const later = await api.post(`/api/melavas/${melavaId}/office-registrations`).set('Cookie', committee).send({ profileId, paid: false });
    expect((later.body.melava as MelavaDetail).registrations?.[0]).toMatchObject({ status: 'pendingPayment', candidateNumber: null, paymentRef: 'To pay at office' });
  });

  it('is for the organisers, and only for families in their branch', async () => {
    const melavaId = (await api.post('/api/melavas').set('Cookie', committee).send(melavaBody(branches.district))).body.melava.id as string;
    const puneCommittee = (await createFamily(branches.pune, { account: 'committee' })).cookie;
    const { profileId: puneProfile } = await walkIn(puneCommittee, branches.pune, {});
    const member = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');

    expect((await api.get(`/api/melavas/${melavaId}/office-search?q=sagar`).set('Cookie', member.cookie)).status).toBe(403);
    expect((await api.post(`/api/melavas/${melavaId}/office-registrations`).set('Cookie', member.cookie).send({ profileId: puneProfile })).status).toBe(403);
    // The Jalgaon office doesn't find, or register, a Pune family.
    expect((await api.get(`/api/melavas/${melavaId}/office-search?q=sagar`).set('Cookie', committee)).body.items).toEqual([]);
    expect((await api.post(`/api/melavas/${melavaId}/office-registrations`).set('Cookie', committee).send({ profileId: puneProfile })).status).toBe(403);
    // An admin can.
    expect((await api.post(`/api/melavas/${melavaId}/office-registrations`).set('Cookie', admin).send({ profileId: puneProfile })).status).toBe(201);
  });
});
