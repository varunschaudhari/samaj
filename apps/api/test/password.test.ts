import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PasswordResetModel } from '../src/models/password-reset.model';
import { SessionModel } from '../src/models/session.model';
import { UserModel } from '../src/models/user.model';
import { MAX_RESET_ATTEMPTS } from '../src/services/password.service';
import { api, clearDb, cookiesFrom, createFamily, refreshCookie, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

const accountOf = async (familyId: string) => UserModel.findOne({ familyId }).orFail().lean();

async function codeFor(cookie: string, userId: string) {
  const res = await api.post(`/api/users/${userId}/reset-code`).set('Cookie', cookie);
  return res;
}

describe('reset codes', () => {
  it('lets the branch committee create a code for a member, formatted for reading aloud', async () => {
    const member = await createFamily(branches.amalner, { account: 'member' });
    const committee = await createFamily(branches.district, { account: 'committee' });
    const res = await codeFor(committee.cookie, String((await accountOf(member.familyId))._id));
    expect(res.status).toBe(201);
    expect(res.body.reset.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(new Date(res.body.reset.expiresAt).getTime()).toBeGreaterThan(Date.now());
    // Stored hashed, never as the code itself.
    const stored = await PasswordResetModel.findOne().lean();
    expect(stored?.codeHash).not.toContain(res.body.reset.code);
  });

  it('shows the permission on the family page', async () => {
    const member = await createFamily(branches.amalner, { account: 'member' });
    const committee = await createFamily(branches.district, { account: 'committee' });
    const family = (await api.get(`/api/families/${member.familyId}`).set('Cookie', committee.cookie)).body.family;
    expect(family.members[0].canResetPassword).toBe(true);
    const own = (await api.get(`/api/families/${member.familyId}`).set('Cookie', member.cookie)).body.family;
    expect(own.members[0].canResetPassword).toBe(false);
  });

  it("refuses codes for yourself, other branches, and committee or admin accounts", async () => {
    const committee = await createFamily(branches.bhusawal, { account: 'committee' });
    const elsewhere = await createFamily(branches.amalner, { account: 'member' });
    const peer = await createFamily(branches.bhusawal, { account: 'committee' });
    const adminAccount = await createFamily(branches.bhusawal, { account: 'admin' });

    for (const target of [committee, elsewhere, peer, adminAccount]) {
      const res = await codeFor(committee.cookie, String((await accountOf(target.familyId))._id));
      expect(res.status).toBe(403);
    }
    // An admin may create one for a committee member.
    expect((await codeFor(adminAccount.cookie, String((await accountOf(peer.familyId))._id))).status).toBe(201);
  });
});

describe('POST /api/auth/reset-password', () => {
  async function setup() {
    const member = await createFamily(branches.amalner, { account: 'member' });
    const user = await accountOf(member.familyId);
    const admin = await createFamily(branches.pune, { account: 'admin' });
    const code = (await codeFor(admin.cookie, String(user._id))).body.reset.code as string;
    return { member, user, code };
  }

  it('sets the new password, works once, and signs the account out everywhere', async () => {
    const { user, code } = await setup();
    const oldSession = cookiesFrom(await api.post('/api/auth/login').send({ phone: user.phone, password: 'password-123' }));

    // Typed the way a person might read it out: lower case, with the dash.
    const typed = `${code.slice(0, 4)}-${code.slice(4)}`.toLowerCase();
    const res = await api.post('/api/auth/reset-password').send({ phone: user.phone, code: typed, password: 'brand-new-pass' });
    expect(res.status).toBe(204);

    expect((await api.post('/api/auth/login').send({ phone: user.phone, password: 'brand-new-pass' })).status).toBe(200);
    expect((await api.post('/api/auth/login').send({ phone: user.phone, password: 'password-123' })).status).toBe(401);
    expect((await api.post('/api/auth/refresh').set('Cookie', refreshCookie(oldSession))).status).toBe(401);

    const again = await api.post('/api/auth/reset-password').send({ phone: user.phone, code, password: 'another-pass-1' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_RESET_CODE');
  });

  it(`stops accepting a code after ${MAX_RESET_ATTEMPTS} wrong guesses`, async () => {
    const { user, code } = await setup();
    const wrong = code.startsWith('A') ? 'BBBBBBBB' : 'AAAAAAAA';
    for (let i = 0; i < MAX_RESET_ATTEMPTS; i++) {
      await api.post('/api/auth/reset-password').send({ phone: user.phone, code: wrong, password: 'brand-new-pass' });
    }
    const right = await api.post('/api/auth/reset-password').send({ phone: user.phone, code, password: 'brand-new-pass' });
    expect(right.status).toBe(400);
  });

  it('rejects an expired code', async () => {
    const { user, code } = await setup();
    await PasswordResetModel.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await api.post('/api/auth/reset-password').send({ phone: user.phone, code, password: 'brand-new-pass' })).status).toBe(400);
  });

  it('answers the same for an unknown number', async () => {
    const res = await api.post('/api/auth/reset-password').send({ phone: '9811111111', code: 'ABCDEFGH', password: 'brand-new-pass' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_CODE');
  });
});

describe('POST /api/auth/change-password', () => {
  it('needs the current password, and signs out other devices but not this one', async () => {
    const member = await createFamily(branches.amalner, { account: 'member' });
    const user = await accountOf(member.familyId);
    const here = cookiesFrom(await api.post('/api/auth/login').send({ phone: user.phone, password: 'password-123' }));
    const elsewhere = cookiesFrom(await api.post('/api/auth/login').send({ phone: user.phone, password: 'password-123' }));
    const cookie = `${Object.entries(here).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')}`;

    const wrong = await api.post('/api/auth/change-password').set('Cookie', cookie).send({ currentPassword: 'nope', newPassword: 'brand-new-pass' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.issues).toEqual([{ path: 'currentPassword', message: 'validation.currentPasswordWrong' }]);

    const ok = await api.post('/api/auth/change-password').set('Cookie', cookie).send({ currentPassword: 'password-123', newPassword: 'brand-new-pass' });
    expect(ok.status).toBe(204);
    expect((await api.post('/api/auth/refresh').set('Cookie', refreshCookie(here))).status).toBe(200);
    expect((await api.post('/api/auth/refresh').set('Cookie', refreshCookie(elsewhere))).status).toBe(401);
    expect(await SessionModel.countDocuments({ userId: user._id, revokedAt: null })).toBeGreaterThanOrEqual(1);
  });
});
