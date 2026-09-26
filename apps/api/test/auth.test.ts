import { ACCESS_COOKIE, REFRESH_COOKIE } from '@samaj/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MemberModel } from '../src/models/member.model';
import { SessionModel } from '../src/models/session.model';
import { UserModel } from '../src/models/user.model';
import { REFRESH_REUSE_GRACE_MS } from '../src/services/auth.service';
import { accessCookie, api, app, clearDb, cookiesFrom, refreshCookie, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;
beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
});

const signupBody = () => ({ name: 'Sunita Chaudhari', phone: '98220 12345', password: 'correct-horse', branchId: branches.bhusawal });

async function signUp() {
  const res = await api.post('/api/auth/signup').send(signupBody());
  expect(res.status).toBe(201);
  return { res, cookies: cookiesFrom(res) };
}

describe('POST /api/auth/signup', () => {
  it('creates the account and a directory entry, and sets both cookies', async () => {
    const { res, cookies } = await signUp();

    expect(res.body.user).toMatchObject({ name: 'Sunita Chaudhari', phone: '+919822012345', role: 'member', language: 'en' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(cookies[ACCESS_COOKIE]).toBeTruthy();
    expect(cookies[REFRESH_COOKIE]).toMatch(/^[a-f0-9]{24}\./);

    const setCookie = String(res.headers['set-cookie']);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Path=\/api\/auth/);

    const user = await UserModel.findOne({ phone: '+919822012345' }).select('+passwordHash').lean();
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await MemberModel.countDocuments({ userId: user?._id })).toBe(1);
  });

  it('rejects a number that already has an account', async () => {
    await signUp();
    const res = await api.post('/api/auth/signup').send({ ...signupBody(), phone: '+91 9822012345' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
    expect(res.body.error.issues).toEqual([{ path: 'phone', message: 'validation.phoneTaken' }]);
  });

  it('returns field issues as translatable keys', async () => {
    const res = await api.post('/api/auth/signup').send({ name: 'S', phone: '12345', password: 'short', branchId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const byPath = Object.fromEntries(res.body.error.issues.map((i: { path: string; message: string }) => [i.path, i.message]));
    expect(byPath).toEqual({
      name: 'validation.nameMin',
      phone: 'validation.phone',
      password: 'validation.passwordMin',
      branchId: 'validation.branchRequired',
    });
  });

  it('rejects a branch that does not exist', async () => {
    const res = await api.post('/api/auth/signup').send({ ...signupBody(), branchId: 'aaaaaaaaaaaaaaaaaaaaaaaa' });
    expect(res.status).toBe(400);
    expect(res.body.error.issues[0].path).toBe('branchId');
  });

  it('blocks requests without the app header', async () => {
    const res = await request(app).post('/api/auth/signup').send(signupBody());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the number in any common format', async () => {
    await signUp();
    const res = await api.post('/api/auth/login').send({ phone: '+91-98220-12345', password: 'correct-horse' });
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('+919822012345');
    expect(cookiesFrom(res)[ACCESS_COOKIE]).toBeTruthy();
  });

  it('gives the same answer for a wrong password and an unknown number', async () => {
    await signUp();
    const wrongPassword = await api.post('/api/auth/login').send({ phone: '9822012345', password: 'wrong-horse' });
    const unknownNumber = await api.post('/api/auth/login').send({ phone: '9822099999', password: 'correct-horse' });
    for (const res of [wrongPassword, unknownNumber]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    expect(wrongPassword.body.error.message).toBe(unknownNumber.body.error.message);
  });
});

describe('GET /api/auth/me', () => {
  it('requires a session', async () => {
    const res = await api.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a tampered token', async () => {
    const { cookies } = await signUp();
    const tampered = `${cookies[ACCESS_COOKIE]}x`;
    const res = await api.get('/api/auth/me').set('Cookie', `${ACCESS_COOKIE}=${tampered}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('returns the signed-in user', async () => {
    const { cookies } = await signUp();
    const res = await api.get('/api/auth/me').set('Cookie', accessCookie(cookies));
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Sunita Chaudhari');
  });

  it('saves the language preference', async () => {
    const { cookies } = await signUp();
    const res = await api.patch('/api/auth/me/preferences').set('Cookie', accessCookie(cookies)).send({ language: 'mr' });
    expect(res.status).toBe(200);
    expect(res.body.user.language).toBe('mr');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const { cookies } = await signUp();
    const res = await api.post('/api/auth/refresh').set('Cookie', refreshCookie(cookies));
    expect(res.status).toBe(200);
    const next = cookiesFrom(res);
    expect(next[REFRESH_COOKIE]).toBeTruthy();
    expect(next[REFRESH_COOKIE]).not.toBe(cookies[REFRESH_COOKIE]);
    expect(next[ACCESS_COOKIE]).toBeTruthy();
  });

  it('tolerates a duplicate refresh inside the grace window', async () => {
    const { cookies } = await signUp();
    const first = await api.post('/api/auth/refresh').set('Cookie', refreshCookie(cookies));
    const second = await api.post('/api/auth/refresh').set('Cookie', refreshCookie(cookies));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it('revokes the session when an old token is replayed after the grace window', async () => {
    const { cookies } = await signUp();
    const rotated = cookiesFrom(await api.post('/api/auth/refresh').set('Cookie', refreshCookie(cookies)));
    await SessionModel.updateMany({}, { $set: { rotatedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) } });

    const replay = await api.post('/api/auth/refresh').set('Cookie', refreshCookie(cookies));
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_EXPIRED');

    // The legitimate holder of the newer token is signed out too.
    const legit = await api.post('/api/auth/refresh').set('Cookie', refreshCookie(rotated));
    expect(legit.status).toBe(401);
  });

  it('fails cleanly with no cookie and clears cookies', async () => {
    const res = await api.post('/api/auth/refresh');
    expect(res.status).toBe(401);
    expect(cookiesFrom(res)[REFRESH_COOKIE]).toBe('');
  });
});

describe('POST /api/auth/logout', () => {
  it('ends the session so the refresh token stops working', async () => {
    const { cookies } = await signUp();
    const out = await api.post('/api/auth/logout').set('Cookie', refreshCookie(cookies));
    expect(out.status).toBe(204);
    expect(cookiesFrom(out)[ACCESS_COOKIE]).toBe('');

    const res = await api.post('/api/auth/refresh').set('Cookie', refreshCookie(cookies));
    expect(res.status).toBe(401);
  });

  it('succeeds without a session', async () => {
    expect((await api.post('/api/auth/logout')).status).toBe(204);
  });
});

describe('error responses', () => {
  it('never include a stack trace', async () => {
    const res = await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{"phone":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await api.get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
