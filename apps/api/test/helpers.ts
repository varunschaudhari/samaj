import { ACCESS_COOKIE, CSRF_HEADER, CSRF_HEADER_VALUE, REFRESH_COOKIE } from '@samaj/shared';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Types } from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app';
import { BranchModel } from '../src/models/branch.model';

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
