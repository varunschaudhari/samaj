import { type GotraId, MAX_PROFILE_PHOTOS, type ProfileDetail, type ProfilePage } from '@samaj/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProfileModel } from '../src/models/profile.model';
import { api, clearDb, completeProfile, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

const year = new Date().getFullYear();
let branches: Awaited<ReturnType<typeof seedBranches>>;
let admin: string;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  admin = (await createFamily(branches.pune, { account: 'admin', people: [{ name: 'Admin Person' }] })).cookie;
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

async function liveProfile(fam: Awaited<ReturnType<typeof familyWithChild>>, extra: Record<string, unknown> = {}) {
  const created = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...completeProfile(fam.birthYear), ...extra, memberId: fam.childId, consent: true });
  expect(created.status).toBe(201);
  const id = (created.body.profile as ProfileDetail).id;
  expect((await api.post(`/api/matrimony/profiles/${id}/approve`).set('Cookie', admin)).status).toBe(200);
  return id;
}

// The smallest valid JPEG header is enough: the API checks the first bytes.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const upload = (cookie: string, id: string, data: Buffer = jpeg) =>
  api.post(`/api/matrimony/profiles/${id}/photos`).set('Cookie', cookie).set('Content-Type', 'image/jpeg').send(data);

describe('biodata fields', () => {
  it('saves and returns the full biodata', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const res = await api
      .post('/api/matrimony/profiles')
      .set('Cookie', fam.cookie)
      .send({
        ...completeProfile(fam.birthYear),
        memberId: fam.childId,
        consent: true,
        maritalStatus: 'neverMarried',
        diet: 'vegetarian',
        birthDate: `${year - 27}-08-21`,
        birthTime: '06:45',
        birthPlace: 'Jalgaon',
        rashi: 'kanya',
        nakshatra: 'hasta',
        workLocation: 'Pune',
        parentOccupation: 'Farmer',
        motherOccupation: 'Homemaker',
        nativeVillage: 'Amalner',
        siblings: { brothers: '1', brothersMarried: '1', sisters: '2', sistersMarried: '' },
        preferences: { ageMin: '22', ageMax: '27', heightMinCm: '150', maritalStatuses: ['neverMarried'], diets: ['vegetarian', 'vegetarian'], branchIds: [branches.district] },
      });
    expect(res.status).toBe(201);
    expect(res.body.profile).toMatchObject({
      maritalStatus: 'neverMarried',
      diet: 'vegetarian',
      birthDate: `${year - 27}-08-21`,
      birthTime: '06:45',
      rashi: 'kanya',
      nakshatra: 'hasta',
      workLocation: 'Pune',
      nativeVillage: 'Amalner',
      siblings: { brothers: 1, brothersMarried: 1, sisters: 2, sistersMarried: null },
      preferences: { ageMin: 22, ageMax: 27, heightMinCm: 150, maritalStatuses: ['neverMarried'], diets: ['vegetarian'], branches: [{ id: branches.district, name: 'Jalgaon District' }] },
      photos: [],
    });
  });

  it('keeps the date of birth in the birth year on the family page', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const res = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...completeProfile(fam.birthYear), memberId: fam.childId, consent: true, birthDate: `${year - 30}-01-01` });
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual([{ path: 'birthDate', message: 'validation.birthDateYear' }]);
  });

  it('checks times, counts and preference ranges', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const res = await api
      .post('/api/matrimony/profiles')
      .set('Cookie', fam.cookie)
      .send({ ...completeProfile(fam.birthYear), memberId: fam.childId, consent: true, birthTime: '25:00', siblings: { brothers: '1', brothersMarried: '2' }, preferences: { ageMin: '30', ageMax: '25' } });
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual(
      expect.arrayContaining([
        { path: 'birthTime', message: 'validation.birthTime' },
        { path: 'siblings.brothersMarried', message: 'validation.marriedCount' },
        { path: 'preferences.ageMax', message: 'validation.prefAgeRange' },
      ]),
    );
  });

  it('drops preferred branches that no longer exist', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const res = await api
      .post('/api/matrimony/profiles')
      .set('Cookie', fam.cookie)
      .send({ ...completeProfile(fam.birthYear), memberId: fam.childId, consent: true, preferences: { branchIds: ['aaaaaaaaaaaaaaaaaaaaaaaa', branches.amalner] } });
    expect(res.body.profile.preferences.branches.map((b: { id: string }) => b.id)).toEqual([branches.amalner]);
  });
});

describe('best matches', () => {
  it('ranks by how many preferences a profile meets, and reports the score', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 28 }, 'kashyap');
    const forId = await liveProfile(groom, { preferences: { ageMin: 22, ageMax: 27, diets: ['vegetarian'], branchIds: [branches.district] } });

    // Created oldest first, so newest-first order is the reverse.
    const all = await familyWithChild(branches.bhusawal, { name: 'Meets All', gender: 'female', age: 24 }, 'atri');
    await liveProfile(all, { diet: 'vegetarian' });
    const two = await familyWithChild(branches.pune, { name: 'Meets Two', gender: 'female', age: 25 }, 'gautam');
    await liveProfile(two, { diet: 'vegetarian' });
    const none = await familyWithChild(branches.pune, { name: 'Meets None', gender: 'female', age: 35 }, 'garg');
    await liveProfile(none, { diet: 'nonVegetarian' });

    const best = (await api.get(`/api/matrimony/search?forProfile=${forId}`).set('Cookie', groom.cookie)).body as ProfilePage;
    expect(best.items.map((p) => [p.name, p.match])).toEqual([
      ['Meets All', { met: 3, total: 3 }],
      ['Meets Two', { met: 2, total: 3 }],
      ['Meets None', { met: 0, total: 3 }],
    ]);

    const newest = (await api.get(`/api/matrimony/search?forProfile=${forId}&sort=newest`).set('Cookie', groom.cookie)).body as ProfilePage;
    expect(newest.items.map((p) => p.name)).toEqual(['Meets None', 'Meets Two', 'Meets All']);
    expect(newest.items[0]?.match).toEqual({ met: 0, total: 3 });
  });

  it('pages through ranked results', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 28 }, 'kashyap');
    const forId = await liveProfile(groom, { preferences: { ageMax: 30 } });
    for (let i = 0; i < 3; i++) await liveProfile(await familyWithChild(branches.pune, { name: `Bride ${i}`, gender: 'female', age: 24 + i }, 'atri'));

    const first = (await api.get(`/api/matrimony/search?forProfile=${forId}&limit=2`).set('Cookie', groom.cookie)).body as ProfilePage;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (await api.get(`/api/matrimony/search?forProfile=${forId}&limit=2&cursor=${first.nextCursor}`).set('Cookie', groom.cookie)).body as ProfilePage;
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((p) => p.name)).size).toBe(3);
  });

  it('shows no score when the family stated no preferences, and filters by the new fields', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 28 }, 'kashyap');
    const forId = await liveProfile(groom);
    await liveProfile(await familyWithChild(branches.pune, { name: 'Tall Veg', gender: 'female', age: 25 }, 'atri'), { heightCm: 165, diet: 'vegetarian', maritalStatus: 'neverMarried' });
    await liveProfile(await familyWithChild(branches.pune, { name: 'Short', gender: 'female', age: 25 }, 'gautam'), { heightCm: 150, diet: 'vegetarian' });

    const res = (await api.get(`/api/matrimony/search?forProfile=${forId}&heightMin=160&diet=vegetarian&maritalStatus=neverMarried`).set('Cookie', groom.cookie)).body as ProfilePage;
    expect(res.items.map((p) => p.name)).toEqual(['Tall Veg']);
    expect(res.items[0]).not.toHaveProperty('match');
  });
});

describe('profile photos', () => {
  it('lets the family add photos, make one the main photo and remove them', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const id = await liveProfile(fam);

    const one = await upload(fam.cookie, id);
    expect(one.status).toBe(201);
    const two = (await upload(fam.cookie, id)).body.profile as ProfileDetail;
    expect(two.photos).toHaveLength(2);
    expect(two.photoUrl).toBe(two.photos[0]?.url);

    const second = two.photos[1]?.id ?? '';
    const moved = (await api.post(`/api/matrimony/profiles/${id}/photos/${second}/main`).set('Cookie', fam.cookie)).body.profile as ProfileDetail;
    expect(moved.photos[0]?.id).toBe(second);

    const bytes = await api.get(moved.photos[0]?.url ?? '').set('Cookie', fam.cookie);
    expect(bytes.status).toBe(200);
    expect(bytes.headers['content-type']).toMatch(/image\/jpeg/);

    const removed = (await api.delete(`/api/matrimony/profiles/${id}/photos/${second}`).set('Cookie', fam.cookie)).body.profile as ProfileDetail;
    expect(removed.photos.map((p) => p.id)).not.toContain(second);
  });

  it(`allows up to ${MAX_PROFILE_PHOTOS}, checks the file, and only for the family`, async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const id = await liveProfile(fam);
    const other = await familyWithChild(branches.amalner, { name: 'Other Son', gender: 'male', age: 27 }, 'atri');

    expect((await upload(other.cookie, id)).status).toBe(403);
    const bad = await upload(fam.cookie, id, Buffer.from('not an image at all'));
    expect(bad.body.error.issues).toEqual([{ path: 'photo', message: 'validation.photoType' }]);

    for (let i = 0; i < MAX_PROFILE_PHOTOS; i++) expect((await upload(fam.cookie, id)).status).toBe(201);
    const over = await upload(fam.cookie, id);
    expect(over.status).toBe(400);
    expect(over.body.error.issues).toEqual([{ path: 'photo', message: 'validation.photoLimit' }]);
  });

  it('serves photos only to people who may see the profile', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const created = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...completeProfile(fam.birthYear), memberId: fam.childId, consent: true });
    const id = created.body.profile.id as string;
    const url = ((await upload(fam.cookie, id)).body.profile as ProfileDetail).photos[0]?.url ?? '';

    // Still waiting for the committee: other families can't see it.
    const neighbour = await createFamily(branches.amalner, { account: 'member' });
    expect((await api.get(url).set('Cookie', neighbour.cookie)).status).toBe(404);

    await api.post(`/api/matrimony/profiles/${id}/approve`).set('Cookie', admin);
    expect((await api.get(url).set('Cookie', neighbour.cookie)).status).toBe(200);
    expect(await ProfileModel.countDocuments()).toBe(1);
  });
});

describe('prompts, shortlist and pass', () => {
  it('saves up to three prompts, one of each', async () => {
    const fam = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 27 }, 'kashyap');
    const prompts = [
      { prompt: 'ourFamily', answer: 'A close-knit oil-mill family from Amalner.' },
      { prompt: 'ourFamily', answer: 'Duplicate, dropped.' },
      { prompt: 'perfectWeekend', answer: 'Cricket in the morning, family lunch.' },
    ];
    const res = await api.post('/api/matrimony/profiles').set('Cookie', fam.cookie).send({ ...completeProfile(fam.birthYear), prompts, memberId: fam.childId, consent: true });
    expect(res.body.profile.prompts).toEqual([
      { prompt: 'ourFamily', answer: 'A close-knit oil-mill family from Amalner.' },
      { prompt: 'perfectWeekend', answer: 'Cricket in the morning, family lunch.' },
    ]);
    const four = Array.from({ length: 4 }, (_, i) => ({ prompt: ['ourFamily', 'iValue', 'proudOf', 'afterMarriage'][i], answer: 'Something to say.' }));
    const tooMany = await api.put(`/api/matrimony/profiles/${res.body.profile.id}`).set('Cookie', fam.cookie).send({ ...completeProfile(fam.birthYear), prompts: four });
    expect(tooMany.body.error.issues).toEqual([{ path: 'prompts', message: 'validation.promptLimit' }]);
  });

  it('keeps passed profiles out of the grid, and Discover to the unseen ones', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 28 }, 'kashyap');
    const forId = await liveProfile(groom);
    const ids: Record<string, string> = {};
    for (const [name, gotra] of [['Passed', 'atri'], ['Saved', 'garg'], ['Talked', 'gautam'], ['Fresh', 'vatsa']] as const) {
      const fam = await familyWithChild(branches.pune, { name, gender: 'female', age: 25 }, gotra);
      ids[name] = await liveProfile(fam);
      if (name === 'Talked') await api.post('/api/matrimony/interests').set('Cookie', fam.cookie).send({ fromProfileId: ids[name], toProfileId: forId });
    }
    const mark = (profileId: string, kind: string | null) => api.put('/api/matrimony/marks').set('Cookie', groom.cookie).send({ fromProfileId: forId, profileId, kind });
    expect((await mark(ids.Passed ?? '', 'pass')).body).toEqual({ kind: 'pass' });
    await mark(ids.Saved ?? '', 'shortlist');

    const names = async (view: string) =>
      ((await api.get(`/api/matrimony/search?forProfile=${forId}&view=${view}`).set('Cookie', groom.cookie)).body as ProfilePage).items.map((p) => [p.name, p.mark]).sort();
    expect(await names('all')).toEqual([['Fresh', null], ['Saved', 'shortlist'], ['Talked', null]]);
    expect(await names('shortlist')).toEqual([['Saved', 'shortlist']]);
    expect(await names('discover')).toEqual([['Fresh', null]]);

    // The detail page knows the family's mark; clearing it brings the profile back.
    const detail = (await api.get(`/api/matrimony/profiles/${ids.Saved}`).set('Cookie', groom.cookie)).body.profile as ProfileDetail;
    expect(detail.marks).toEqual([{ fromProfileId: forId, kind: 'shortlist' }]);
    await mark(ids.Passed ?? '', null);
    expect((await names('all')).map((n) => n[0])).toContain('Passed');
  });

  it('only marks for your own profile, and never your own family', async () => {
    const groom = await familyWithChild(branches.amalner, { name: 'Rohit Wagh', gender: 'male', age: 28 }, 'kashyap');
    const forId = await liveProfile(groom);
    const bride = await familyWithChild(branches.pune, { name: 'Neha', gender: 'female', age: 25 }, 'atri');
    const brideId = await liveProfile(bride);
    expect((await api.put('/api/matrimony/marks').set('Cookie', bride.cookie).send({ fromProfileId: forId, profileId: brideId, kind: 'pass' })).status).toBe(403);
    expect((await api.put('/api/matrimony/marks').set('Cookie', groom.cookie).send({ fromProfileId: forId, profileId: forId, kind: 'shortlist' })).status).toBe(404);
  });
});

describe('pre-filling a new profile from the family page', () => {
  it('suggests names, parents, siblings, places and phones', async () => {
    const fam = await createFamily(branches.amalner, {
      account: 'member',
      gotra: 'kashyap',
      people: [
        { name: 'Ramesh Wagh', occupation: 'Farmer' },
        { name: 'Sunita Wagh', relation: 'spouse', gender: 'female', occupation: 'Teacher' },
        { name: 'Rohit Wagh', relation: 'son', birthYear: year - 27, occupation: 'Engineer' },
        { name: 'Pooja Wagh', relation: 'daughter', gender: 'female', birthYear: year - 22 },
      ],
    });
    const res = await api.get(`/api/matrimony/prefill/${fam.memberIds[2]}`).set('Cookie', fam.cookie);
    expect(res.status).toBe(200);
    expect(res.body.prefill).toMatchObject({
      surname: 'Wagh',
      firstName: 'Rohit',
      fatherName: 'Ramesh',
      occupation: 'Engineer',
      parentName: 'Wagh Ramesh',
      parentOccupation: 'Farmer',
      motherOccupation: 'Teacher',
      village: 'Amalner',
      nativeVillage: 'Amalner',
      district: 'Jalgaon',
      contactName: 'Ramesh Wagh',
      siblings: { brothers: 0, brothersMarried: 0, sisters: 1, sistersMarried: 0 },
    });
    expect(res.body.prefill.contactPhone).toMatch(/^\+91/);

    const other = await createFamily(branches.amalner, { account: 'member' });
    expect((await api.get(`/api/matrimony/prefill/${fam.memberIds[2]}`).set('Cookie', other.cookie)).status).toBe(403);
  });
});
