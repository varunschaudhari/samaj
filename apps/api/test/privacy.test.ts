import { DELETION_GRACE_DAYS, type FamilyDetail, type MemberPage, PRIVACY_NOTICE_VERSION, type PrivacyStatus } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FamilyLinkModel, linkPair } from '../src/models/family-link.model';
import { FamilyModel } from '../src/models/family.model';
import { MemberModel } from '../src/models/member.model';
import { SessionModel } from '../src/models/session.model';
import { UserModel } from '../src/models/user.model';
import { purgeDue } from '../src/services/privacy.service';
import { api, clearDb, createFamily, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

const DAY = 24 * 60 * 60 * 1000;
const phoneOf = async (cookie: string, name: string) =>
  ((await api.get(`/api/members?q=${encodeURIComponent(name)}`).set('Cookie', cookie)).body as MemberPage).items.find((m) => m.name === name)?.phone;
const status = async (cookie: string) => (await api.get('/api/privacy/status').set('Cookie', cookie)).body.status as PrivacyStatus;

describe('consent to the privacy notice', () => {
  it('holds back everything but the privacy routes until the current notice is agreed', async () => {
    const own = await createFamily(branches.amalner, { account: 'member' });
    await UserModel.updateMany({}, { $set: { consentVersion: null } });

    expect((await api.get('/api/auth/me').set('Cookie', own.cookie)).body.user).toMatchObject({ needsConsent: true });
    const blocked = await api.get('/api/members').set('Cookie', own.cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('CONSENT_REQUIRED');

    expect((await api.post('/api/privacy/consent').set('Cookie', own.cookie).send({ version: 'old', accept: true })).status).toBe(400);
    const agreed = await api.post('/api/privacy/consent').set('Cookie', own.cookie).send({ version: PRIVACY_NOTICE_VERSION, accept: true });
    expect(agreed.body.status.consentedAt).toBeTruthy();
    expect((await api.get('/api/members').set('Cookie', own.cookie)).status).toBe(200);
    expect((await api.get('/api/auth/me').set('Cookie', own.cookie)).body.user.needsConsent).toBe(false);
  });

  it('is part of signing up, and of adding someone to a family', async () => {
    const res = await api.post('/api/auth/signup').send({ name: 'Sunita Wagh', phone: '9822012345', password: 'sunita-pass-1', branchId: branches.amalner, gender: 'female' });
    expect(res.body.error.issues).toEqual([{ path: 'consent', message: 'validation.consentRequired' }]);
    const own = await createFamily(branches.amalner, { account: 'member' });
    const add = await api.post(`/api/families/${own.familyId}/members`).set('Cookie', own.cookie).send({ name: 'Rohit Wagh', relation: 'son', gender: 'male' });
    expect(add.body.error.issues).toEqual([{ path: 'consent', message: 'validation.consentRequired' }]);
  });

  it('publishes the notice version and the contact, without signing in', async () => {
    const res = await api.get('/api/privacy/info');
    expect(res.body.info).toMatchObject({ version: PRIVACY_NOTICE_VERSION, contact: { name: null } });
  });
});

describe('who sees a phone number, and who is listed', () => {
  async function setup() {
    const anil = await createFamily(branches.bhusawal, { account: 'member', people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh', relation: 'son' }] });
    const sameTown = await createFamily(branches.bhusawal, { account: 'member' });
    const otherTown = await createFamily(branches.amalner, { account: 'member' });
    return { anil, sameTown, otherTown, anilMemberId: anil.memberIds[0] ?? '', rohitId: anil.memberIds[1] ?? '' };
  }
  const setPrivacy = (cookie: string, memberId: string, body: object) => api.put(`/api/privacy/members/${memberId}`).set('Cookie', cookie).send(body);

  it('is the family and committee by default; the person can widen it to their branch or every member', async () => {
    const { anil, sameTown, otherTown, anilMemberId } = await setup();
    expect(await phoneOf(sameTown.cookie, 'Anil Wagh')).toBeUndefined();

    expect((await setPrivacy(anil.cookie, anilMemberId, { phoneVisibility: 'branch', listed: true })).status).toBe(204);
    expect(await phoneOf(sameTown.cookie, 'Anil Wagh')).toMatch(/^\+91/);
    expect(await phoneOf(otherTown.cookie, 'Anil Wagh')).toBeUndefined();

    await setPrivacy(anil.cookie, anilMemberId, { phoneVisibility: 'members', listed: true });
    expect(await phoneOf(otherTown.cookie, 'Anil Wagh')).toMatch(/^\+91/);
  });

  it('takes someone out of the directory and off other families’ view, but not their own', async () => {
    const { anil, sameTown, anilMemberId } = await setup();
    await setPrivacy(anil.cookie, anilMemberId, { phoneVisibility: 'committee', listed: false });
    expect(((await api.get('/api/members?q=anil').set('Cookie', sameTown.cookie)).body as MemberPage).items).toEqual([]);
    const seenByOthers = (await api.get(`/api/families/${anil.familyId}`).set('Cookie', sameTown.cookie)).body.family as FamilyDetail;
    expect(seenByOthers.members.map((m) => m.name)).toEqual(['Rohit Wagh']);
    const seenByFamily = (await api.get(`/api/families/${anil.familyId}`).set('Cookie', anil.cookie)).body.family as FamilyDetail;
    expect(seenByFamily.members.find((m) => m.name === 'Anil Wagh')?.privacy).toEqual({ phoneVisibility: 'committee', listed: false });
  });

  it('is set by the person themselves; the family sets it for people without an account', async () => {
    const { anil, sameTown, anilMemberId, rohitId } = await setup();
    expect((await setPrivacy(sameTown.cookie, anilMemberId, { phoneVisibility: 'members', listed: true })).status).toBe(403);
    expect((await setPrivacy(anil.cookie, rohitId, { phoneVisibility: 'members', listed: true })).status).toBe(204);
    const rohit = (await api.get(`/api/families/${anil.familyId}`).set('Cookie', anil.cookie)).body.family.members.find((m: { name: string }) => m.name === 'Rohit Wagh');
    expect(rohit).toMatchObject({ canEditPrivacy: true, privacy: { phoneVisibility: 'members' } });
  });
});

describe('downloading and deleting your data', () => {
  it('downloads everything held about the account and family as JSON', async () => {
    const own = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh', relation: 'son' }] });
    const res = await api.get('/api/privacy/export').set('Cookie', own.cookie);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="samaj-my-data-/);
    const data = JSON.parse(res.text);
    expect(data.account).toMatchObject({ name: 'Anil Wagh', role: 'member' });
    expect(data.family.members.map((m: { name: string }) => m.name)).toEqual(['Anil Wagh', 'Rohit Wagh']);
    expect(data.signIns.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain('tokenHash');
  });

  it('erases one person after the grace period, and can be cancelled before it', async () => {
    const own = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }, { name: 'Priya Wagh', relation: 'daughter', gender: 'female' }] });
    const priyaId = own.memberIds[1] ?? '';
    const priya = await UserModel.create({ name: 'Priya Wagh', phone: '+919822011111', passwordHash: (await UserModel.findOne({ memberId: own.memberIds[0] }).select('+passwordHash').lean())?.passwordHash, branchId: branches.amalner, familyId: own.familyId, memberId: priyaId, consentVersion: PRIVACY_NOTICE_VERSION });
    await MemberModel.updateOne({ _id: priyaId }, { $set: { userId: priya._id, phone: '+919822011111' } });
    const login = await api.post('/api/auth/login').send({ phone: '+919822011111', password: 'password-123' });
    const priyaCookie = String(login.headers['set-cookie']?.[0] ?? '').split(';')[0] ?? '';

    expect((await api.post('/api/privacy/deletion').set('Cookie', priyaCookie).send({ scope: 'self', password: 'wrong' })).body.error.issues).toEqual([{ path: 'password', message: 'validation.passwordWrong' }]);
    const asked = (await api.post('/api/privacy/deletion').set('Cookie', priyaCookie).send({ scope: 'self', password: 'password-123' })).body.status as PrivacyStatus;
    expect(asked.deletion?.scope).toBe('self');
    expect(new Date(asked.deletion?.dueAt ?? 0).getTime()).toBeGreaterThan(Date.now() + (DELETION_GRACE_DAYS - 1) * DAY);

    // Cancelled, nothing happens even after the grace period.
    expect((await api.delete('/api/privacy/deletion').set('Cookie', priyaCookie)).body.status.deletion).toBeNull();
    expect(await purgeDue(new Date(Date.now() + 8 * DAY))).toBe(0);

    await api.post('/api/privacy/deletion').set('Cookie', priyaCookie).send({ scope: 'self', password: 'password-123' });
    expect(await purgeDue(new Date(Date.now() + DAY))).toBe(0);
    expect(await purgeDue(new Date(Date.now() + 8 * DAY))).toBe(1);
    expect(await UserModel.exists({ _id: priya._id })).toBeNull();
    expect(await MemberModel.exists({ _id: priyaId })).toBeNull();
    expect(await SessionModel.countDocuments({ userId: priya._id })).toBe(0);
    // The rest of the family stays.
    expect(await MemberModel.countDocuments({ familyId: own.familyId })).toBe(1);
  });

  it('lets a head delete the whole family only when no one else in it has an account', async () => {
    const own = await createFamily(branches.amalner, { account: 'member', people: [{ name: 'Anil Wagh' }, { name: 'Rohit Wagh', relation: 'son' }] });
    const other = await createFamily(branches.amalner);
    await FamilyLinkModel.create({ fromFamilyId: own.familyId, toFamilyId: other.familyId, kind: 'relatives', status: 'accepted', pair: linkPair(own.familyId, other.familyId), requestedByUserId: new Types.ObjectId(), requestedByName: 'x' });

    const s = await status(own.cookie);
    expect(s).toMatchObject({ canDeleteSelf: false, deleteSelfBlockedBy: 'isHead', canDeleteFamily: true });
    expect((await api.post('/api/privacy/deletion').set('Cookie', own.cookie).send({ scope: 'self', password: 'password-123' })).body.error.issues).toEqual([
      { path: 'scope', message: 'validation.deletionIsHead' },
    ]);
    await api.post('/api/privacy/deletion').set('Cookie', own.cookie).send({ scope: 'family', password: 'password-123' });
    await purgeDue(new Date(Date.now() + 8 * DAY));
    expect(await FamilyModel.exists({ _id: own.familyId })).toBeNull();
    expect(await MemberModel.countDocuments({ familyId: own.familyId })).toBe(0);
    expect(await FamilyLinkModel.countDocuments()).toBe(0);
    expect(await FamilyModel.exists({ _id: other.familyId })).toBeTruthy();
  });

  it("won't let the last super admin delete themselves", async () => {
    const own = await createFamily(branches.amalner, { account: 'superadmin' });
    expect(await status(own.cookie)).toMatchObject({ canDeleteSelf: false, deleteSelfBlockedBy: 'lastSuperadmin', canDeleteFamily: false });
  });
});
