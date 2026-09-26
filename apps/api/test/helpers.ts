import argon2 from 'argon2';
import { ACCESS_COOKIE, CSRF_HEADER, CSRF_HEADER_VALUE, type FamilyStatus, REFRESH_COOKIE, type Relation, type Role } from '@samaj/shared';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { BranchModel } from '../src/models/branch.model';
import { FamilyModel } from '../src/models/family.model';
import { MemberModel } from '../src/models/member.model';
import { UserModel } from '../src/models/user.model';

let mongo: MongoMemoryServer | undefined;

export async function startDb() {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}

export async function stopDb() {
  await mongoose.disconnect();
  await mongo?.stop();
}

export async function clearDb() {
  const collections = await mongoose.connection.db?.collections();
  await Promise.all((collections ?? []).map((c) => c.deleteMany({})));
}

export const app = createApp();

/** A supertest request that looks like it came from the web app. */
export const api = {
  get: (url: string) => request(app).get(url),
  post: (url: string) => request(app).post(url).set(CSRF_HEADER, CSRF_HEADER_VALUE),
  patch: (url: string) => request(app).patch(url).set(CSRF_HEADER, CSRF_HEADER_VALUE),
  put: (url: string) => request(app).put(url).set(CSRF_HEADER, CSRF_HEADER_VALUE),
  delete: (url: string) => request(app).delete(url).set(CSRF_HEADER, CSRF_HEADER_VALUE),
};

/** District -> two towns. Returns ids as strings. */
export async function seedBranches() {
  const district = await BranchModel.create({ name: 'Jalgaon District', nameMr: 'जळगाव जिल्हा', kind: 'district' });
  const child = (name: string, nameMr: string) =>
    BranchModel.create({ name, nameMr, kind: 'town', parentId: district._id, ancestors: [district._id] });
  const bhusawal = await child('Bhusawal', 'भुसावळ');
  const amalner = await child('Amalner', 'अमळनेर');
  const other = await BranchModel.create({ name: 'Pune District', nameMr: 'पुणे जिल्हा', kind: 'district' });
  const id = (d: { _id: Types.ObjectId }) => String(d._id);
  return { district: id(district), bhusawal: id(bhusawal), amalner: id(amalner), pune: id(other) };
}

/** Parse Set-Cookie headers into name -> value (empty string when cleared). */
export function cookiesFrom(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const out: Record<string, string> = {};
  for (const line of list) {
    const [pair] = line.split(';');
    const eq = pair?.indexOf('=') ?? -1;
    if (pair && eq > 0) out[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1));
  }
  return out;
}

export const cookieHeader = (cookies: Record<string, string>) =>
  Object.entries(cookies)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');

export const accessCookie = (c: Record<string, string>) => cookieHeader({ [ACCESS_COOKIE]: c[ACCESS_COOKIE] ?? '' });
export const refreshCookie = (c: Record<string, string>) => cookieHeader({ [REFRESH_COOKIE]: c[REFRESH_COOKIE] ?? '' });

let phoneSeq = 0;
const uniquePhone = () => `+9199${String(10000000 + ++phoneSeq).padStart(8, '0')}`;

interface PersonFixture {
  name: string;
  relation?: Relation;
  gotra?: string;
  occupation?: string;
}

interface FamilyFixture {
  status?: FamilyStatus;
  gotra?: string | null;
  /** The first person is the head. */
  people?: PersonFixture[];
  /** Give the head an account with this role, and sign them in. */
  account?: Role;
}

/** Create a family directly in the database. Returns ids and, with `account`, a signed-in cookie. */
export async function createFamily(branchId: string, fixture: FamilyFixture = {}) {
  const branch = await BranchModel.findById(branchId).orFail().lean();
  const people = fixture.people ?? [{ name: 'Test Head' }];
  const family = await FamilyModel.create({
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    place: branch.name,
    gotra: fixture.gotra ?? null,
    status: fixture.status ?? 'verified',
    history: [{ at: new Date(), action: 'created', byName: people[0]?.name ?? 'x' }],
  });
  const userId = fixture.account ? new Types.ObjectId() : null;
  const members = await MemberModel.insertMany(
    people.map((p, i) => ({
      familyId: family._id,
      name: p.name,
      relation: p.relation ?? (i === 0 ? 'head' : 'son'),
      isHead: i === 0,
      gender: 'male',
      occupation: p.occupation ?? null,
      phone: uniquePhone(),
      userId: i === 0 ? userId : null,
      branchId: branch._id,
      branchAncestors: branch.ancestors,
      place: family.place,
      gotra: family.gotra,
      familyStatus: family.status,
    })),
  );

  let cookie = '';
  if (fixture.account && userId && members[0]) {
    const phone = members[0].phone ?? uniquePhone();
    await UserModel.create({
      _id: userId,
      name: people[0]?.name ?? 'x',
      phone,
      role: fixture.account,
      branchId: branch._id,
      familyId: family._id,
      memberId: members[0]._id,
      passwordHash: await argon2.hash('password-123'),
    });
    const res = await api.post('/api/auth/login').send({ phone, password: 'password-123' });
    cookie = accessCookie(cookiesFrom(res));
  }
  return { familyId: String(family._id), memberIds: members.map((m) => String(m._id)), cookie };
}
