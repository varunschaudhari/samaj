import argon2 from 'argon2';
import type { Member, Role } from '@samaj/shared';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BranchModel } from '../src/models/branch.model';
import { MemberModel } from '../src/models/member.model';
import { UserModel } from '../src/models/user.model';
import { accessCookie, api, clearDb, cookiesFrom, seedBranches, startDb, stopDb } from './helpers';

beforeAll(startDb);
afterAll(stopDb);

let branches: Awaited<ReturnType<typeof seedBranches>>;

async function addMember(name: string, branchId: string, extra: Partial<{ gotra: string; occupation: string }> = {}) {
  const branch = await BranchModel.findById(branchId).orFail().lean();
  return MemberModel.create({
    name,
    place: branch.name,
    phone: `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    verified: true,
    ...extra,
  });
}

async function signInAs(role: Role, branchId: string) {
  const phone = `+9199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
  await UserModel.create({ name: `${role} user`, phone, role, branchId: new Types.ObjectId(branchId), passwordHash: await argon2.hash('password-123') });
  const res = await api.post('/api/auth/login').send({ phone, password: 'password-123' });
  return accessCookie(cookiesFrom(res));
}

const list = async (cookie: string, query = '') => {
  const res = await api.get(`/api/members${query}`).set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body as { items: Member[]; total: number; nextCursor: string | null };
};

beforeEach(async () => {
  await clearDb();
  branches = await seedBranches();
  await addMember('Anil Wagh', branches.bhusawal, { gotra: 'Kashyap', occupation: 'Oil mill owner' });
  await addMember('Kavita Dhole', branches.amalner, { gotra: 'Atri' });
  await addMember('Ramesh Karale', branches.pune, { gotra: 'Kashyap' });
});

describe('GET /api/members', () => {
  it('requires a session', async () => {
    expect((await api.get('/api/members')).status).toBe(401);
  });

  it('hides phone numbers from ordinary members', async () => {
    const body = await list(await signInAs('member', branches.bhusawal));
    expect(body.total).toBe(3);
    expect(body.items.every((m) => m.phone === undefined)).toBe(true);
  });

  it('shows committee members phone numbers only inside their branch subtree', async () => {
    const body = await list(await signInAs('committee', branches.district));
    const phoneByName = Object.fromEntries(body.items.map((m) => [m.name, m.phone]));
    expect(phoneByName['Anil Wagh']).toMatch(/^\+91/);
    expect(phoneByName['Kavita Dhole']).toMatch(/^\+91/);
    expect(phoneByName['Ramesh Karale']).toBeUndefined();
  });

  it('a town committee member does not see a sibling town', async () => {
    const body = await list(await signInAs('committee', branches.bhusawal));
    const phoneByName = Object.fromEntries(body.items.map((m) => [m.name, m.phone]));
    expect(phoneByName['Anil Wagh']).toBeDefined();
    expect(phoneByName['Kavita Dhole']).toBeUndefined();
  });

  it('shows admins every phone number', async () => {
    const body = await list(await signInAs('admin', branches.pune));
    expect(body.items.every((m) => m.phone)).toBe(true);
  });

  it('searches from the start of any word, filters by branch subtree and gotra', async () => {
    const cookie = await signInAs('member', branches.pune);
    expect((await list(cookie, '?q=wag')).items.map((m) => m.name)).toEqual(['Anil Wagh']);
    expect((await list(cookie, '?q=oil')).items.map((m) => m.name)).toEqual(['Anil Wagh']);
    expect((await list(cookie, '?q=agh')).items).toHaveLength(0);
    expect((await list(cookie, `?branchId=${branches.district}`)).total).toBe(2);
    expect((await list(cookie, '?gotra=kashyap')).items.map((m) => m.name)).toEqual(['Anil Wagh', 'Ramesh Karale']);
  });

  it('treats regex characters in the search as plain text', async () => {
    const cookie = await signInAs('member', branches.pune);
    expect((await list(cookie, '?q=.*')).items).toHaveLength(0);
  });

  it('pages with a cursor', async () => {
    const cookie = await signInAs('member', branches.pune);
    const first = await list(cookie, '?limit=2');
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await list(cookie, `?limit=2&cursor=${first.nextCursor}`);
    expect(second.items.map((m) => m.name)).toEqual(['Ramesh Karale']);
    expect(second.nextCursor).toBeNull();
  });

  it('lists gotras in use', async () => {
    const cookie = await signInAs('member', branches.pune);
    const res = await api.get('/api/members/gotras').set('Cookie', cookie);
    expect(res.body.items).toEqual(['Atri', 'Kashyap']);
  });
});
