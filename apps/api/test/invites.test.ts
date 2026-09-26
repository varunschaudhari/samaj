import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyModel } from '../src/models/family.model';
import { InviteModel } from '../src/models/invite.model';
import { MemberModel } from '../src/models/member.model';
import { UserModel } from '../src/models/user.model';
import { MAX_INVITE_ATTEMPTS } from '../src/services/invite.service';
import { accessCookie, api, clearDb, cookiesFrom, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

/** A family whose head signs in, with a spouse listed (with a phone) who has no sign-in yet. */
async function householdWithSpouse(branchId: string, status: 'verified' | 'pending' = 'verified') {
  const family = await createFamily(branchId, {
    status,
    account: 'member',
    people: [{ name: 'Ramesh Wagh' }, { name: 'Sunita Wagh', relation: 'spouse', gender: 'female' }],
  });
  const spouseId = family.memberIds[1] ?? '';
  const spouse = await MemberModel.findById(spouseId).orFail().lean();
  return { ...family, spouseId, spousePhone: spouse.phone ?? '' };
}

const invite = (cookie: string, familyId: string, memberId: string) =>
  api.post(`/api/families/${familyId}/members/${memberId}/invite`).set('Cookie', cookie);

const join = (phone: string, code: string, password = 'sunita-pass-1') => api.post('/api/auth/join').send({ phone, code, password });

describe('invite codes', () => {
  it('lets the family give a listed person their own sign-in to the same family', async () => {
    const home = await householdWithSpouse(branches.amalner);
    const created = await invite(home.cookie, home.familyId, home.spouseId);
    expect(created.status).toBe(201);
    expect(created.body.invite.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(await InviteModel.findOne().lean()).not.toMatchObject({ codeHash: expect.stringContaining(created.body.invite.code) });

    // Typed the way people read it out: lower case, with the dash.
    const code = String(created.body.invite.code);
    const res = await join(home.spousePhone, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Sunita Wagh', role: 'member', familyId: home.familyId, memberId: home.spouseId, familyStatus: 'verified' });
    expect(cookiesFrom(res)).toBeTruthy();

    // No second family; the listed person now has the account.
    expect(await FamilyModel.countDocuments()).toBe(1);
    expect((await MemberModel.findById(home.spouseId).orFail().lean()).userId).toBeTruthy();
    expect(await InviteModel.countDocuments()).toBe(0);

    const history = (await FamilyModel.findById(home.familyId).orFail().lean()).history.map((h) => h.action);
    expect(history).toEqual(expect.arrayContaining(['invited', 'joined']));

    // She can sign in with her own password, and the family page shows her account.
    const login = await api.post('/api/auth/login').send({ phone: home.spousePhone, password: 'sunita-pass-1' });
    expect(login.status).toBe(200);
    const page = (await api.get(`/api/families/${home.familyId}`).set('Cookie', accessCookie(cookiesFrom(login)))).body.family;
    expect(page.members.find((m: { id: string }) => m.id === home.spouseId)).toMatchObject({ hasAccount: true, canInvite: false });
  });

  it('keeps a pending family pending', async () => {
    const home = await householdWithSpouse(branches.amalner, 'pending');
    const { body } = await invite(home.cookie, home.familyId, home.spouseId);
    const res = await join(home.spousePhone, body.invite.code);
    expect(res.body.user.familyStatus).toBe('pending');
  });

  it('works once', async () => {
    const home = await householdWithSpouse(branches.amalner);
    const { body } = await invite(home.cookie, home.familyId, home.spouseId);
    expect((await join(home.spousePhone, body.invite.code)).status).toBe(201);
    const again = await join(home.spousePhone, body.invite.code);
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_INVITE_CODE');
  });

  it('gives the same answer for a wrong code, a wrong number and an unlisted number', async () => {
    const home = await householdWithSpouse(branches.amalner);
    const { body } = await invite(home.cookie, home.familyId, home.spouseId);
    const other = await createFamily(branches.amalner, { people: [{ name: 'Someone' }] });
    const otherPhone = (await MemberModel.findById(other.memberIds[0]).orFail().lean()).phone ?? '';

    for (const res of [await join(home.spousePhone, 'AAAABBBB'), await join(otherPhone, body.invite.code), await join('9123456780', body.invite.code)]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_INVITE_CODE');
      expect(res.body.error.issues).toEqual([{ path: 'code', message: 'validation.inviteCode' }]);
    }
  });

  it(`stops working after ${MAX_INVITE_ATTEMPTS} wrong guesses`, async () => {
    const home = await householdWithSpouse(branches.amalner);
    const { body } = await invite(home.cookie, home.familyId, home.spouseId);
    for (let i = 0; i < MAX_INVITE_ATTEMPTS; i++) await join(home.spousePhone, 'AAAABBBB');
    expect((await join(home.spousePhone, body.invite.code)).status).toBe(400);
  });

  it('replaces the earlier code when a new one is created', async () => {
    const home = await householdWithSpouse(branches.amalner);
    const first = (await invite(home.cookie, home.familyId, home.spouseId)).body.invite.code;
    const second = (await invite(home.cookie, home.familyId, home.spouseId)).body.invite.code;
    expect(await InviteModel.countDocuments()).toBe(1);
    if (first !== second) expect((await join(home.spousePhone, first)).status).toBe(400);
    expect((await join(home.spousePhone, second)).status).toBe(201);
  });

  it('needs a mobile number on the person first', async () => {
    const home = await householdWithSpouse(branches.amalner);
    await MemberModel.updateOne({ _id: home.spouseId }, { $set: { phone: null } });
    const res = await invite(home.cookie, home.familyId, home.spouseId);
    expect(res.status).toBe(400);
    expect(res.body.error.issues).toEqual([{ path: 'phone', message: 'validation.phoneNeeded' }]);
  });

  it("refuses people who already sign in, and numbers that sign someone else in", async () => {
    const home = await householdWithSpouse(branches.amalner);
    expect((await invite(home.cookie, home.familyId, home.memberIds[0] ?? '')).status).toBe(409);

    const elsewhere = await createFamily(branches.amalner, { account: 'member' });
    const taken = (await UserModel.findOne({ familyId: elsewhere.familyId }).orFail().lean()).phone;
    await MemberModel.updateOne({ _id: home.spouseId }, { $set: { phone: taken } });
    const res = await invite(home.cookie, home.familyId, home.spouseId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('lets the branch committee create one, but not other families or other branches', async () => {
    const home = await householdWithSpouse(branches.amalner);
    const committee = await createFamily(branches.district, { account: 'committee' });
    const otherCommittee = await createFamily(branches.bhusawal, { account: 'committee' });
    const neighbour = await createFamily(branches.amalner, { account: 'member' });

    expect((await invite(committee.cookie, home.familyId, home.spouseId)).status).toBe(201);
    expect((await invite(otherCommittee.cookie, home.familyId, home.spouseId)).status).toBe(403);
    expect((await invite(neighbour.cookie, home.familyId, home.spouseId)).status).toBe(403);

    const asCommittee = (await api.get(`/api/families/${home.familyId}`).set('Cookie', committee.cookie)).body.family;
    expect(asCommittee.members.map((m: { canInvite: boolean }) => m.canInvite)).toEqual([false, true]);
    const asNeighbour = (await api.get(`/api/families/${home.familyId}`).set('Cookie', neighbour.cookie)).body.family;
    expect(asNeighbour.members.every((m: { canInvite: boolean }) => !m.canInvite)).toBe(true);
  });

  it('is removed along with the person', async () => {
    const home = await householdWithSpouse(branches.amalner);
    await invite(home.cookie, home.familyId, home.spouseId);
    await api.delete(`/api/families/${home.familyId}/members/${home.spouseId}`).set('Cookie', home.cookie);
    expect(await InviteModel.countDocuments()).toBe(0);
  });
});

describe('signup with a number already listed in a family', () => {
  it('is refused and pointed at the invite code, so no duplicate family is created', async () => {
    const home = await householdWithSpouse(branches.amalner);
    const res = await api
      .post('/api/auth/signup')
      .send({ name: 'Sunita Wagh', phone: home.spousePhone, password: 'sunita-pass-1', branchId: branches.amalner, gender: 'female' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_LISTED');
    expect(res.body.error.issues).toEqual([{ path: 'phone', message: 'validation.phoneListed' }]);
    expect(await FamilyModel.countDocuments()).toBe(1);
  });
});

describe('committee enrolment', () => {
  const enrolBody = (branchId: string, head: Record<string, unknown> = {}) => ({
    branchId,
    place: '',
    gotra: '',
    address: 'Near the temple',
    head: { name: 'Vitthal Mahajan', gender: 'male', birthYear: '1950', occupation: '', education: '', phone: '', ...head },
  });
  const enrol = (cookie: string, body: object) => api.post('/api/families').set('Cookie', cookie).send(body);

  it('creates a verified family with its head, in the committee branch', async () => {
    const committee = await createFamily(branches.district, { account: 'committee' });
    const res = await enrol(committee.cookie, enrolBody(branches.amalner));
    expect(res.status).toBe(201);
    expect(res.body.family).toMatchObject({
      status: 'verified',
      headName: 'Vitthal Mahajan',
      place: 'Amalner',
      address: 'Near the temple',
      branch: { id: branches.amalner },
      permissions: { canEdit: true },
    });
    expect(res.body.family.members).toEqual([expect.objectContaining({ relation: 'head', isHead: true, hasAccount: false, canInvite: true, birthYear: 1950 })]);
    expect(res.body.family.history.map((h: { action: string }) => h.action)).toEqual(['verified', 'created']);

    // It shows in the directory straight away.
    const neighbour = await createFamily(branches.amalner, { account: 'member' });
    const directory = await api.get('/api/members?q=Vitthal').set('Cookie', neighbour.cookie);
    expect(directory.body.items).toHaveLength(1);
  });

  it('lets the head join later with an invite code', async () => {
    const committee = await createFamily(branches.amalner, { account: 'committee' });
    const created = (await enrol(committee.cookie, enrolBody(branches.amalner, { phone: '98220 77777' }))).body.family;
    const headId = created.members[0].id;
    const { body } = await invite(committee.cookie, created.id, headId);
    const res = await join('9822077777', body.invite.code);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ familyId: created.id, memberId: headId, familyStatus: 'verified' });
  });

  it('is limited to the committee branch, and closed to members', async () => {
    const committee = await createFamily(branches.bhusawal, { account: 'committee' });
    const member = await createFamily(branches.amalner, { account: 'member' });
    const admin = await createFamily(branches.pune, { account: 'admin' });
    expect((await enrol(committee.cookie, enrolBody(branches.amalner))).status).toBe(403);
    expect((await enrol(committee.cookie, enrolBody(branches.district))).status).toBe(403);
    expect((await enrol(member.cookie, enrolBody(branches.amalner))).status).toBe(403);
    expect((await enrol(admin.cookie, enrolBody(branches.amalner))).status).toBe(201);
    expect(await FamilyModel.countDocuments()).toBe(4);
  });

  it("refuses a head's number that already belongs to someone", async () => {
    const committee = await createFamily(branches.amalner, { account: 'committee' });
    const home = await householdWithSpouse(branches.amalner);
    const res = await enrol(committee.cookie, enrolBody(branches.amalner, { phone: home.spousePhone }));
    expect(res.status).toBe(409);
    expect(res.body.error.issues).toEqual([{ path: 'head.phone', message: 'validation.phoneListed' }]);
  });

  it('checks the input', async () => {
    const committee = await createFamily(branches.amalner, { account: 'committee' });
    const res = await enrol(committee.cookie, { branchId: 'nope', head: { name: 'V' } });
    expect(res.status).toBe(400);
    const paths = res.body.error.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['branchId', 'head.name', 'head.gender']));
  });
});
