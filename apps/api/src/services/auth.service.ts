import argon2 from 'argon2';
import { type FamilyStatus, PRIVACY_NOTICE_VERSION, type PublicUser, type UpdatePreferencesInput, type joinSchema, type loginSchema, type signupSchema } from '@samaj/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { SessionModel } from '../models/session.model';
import { type UserDoc, UserModel } from '../models/user.model';
import { AppError, unauthenticated } from '../utils/app-error';
import { logger } from '../utils/logger';
import { recordHistory } from './family.service';
import { checkInvite, invalidInvite } from './invite.service';
import { assertPhoneFree, phoneTaken } from './phones';
import {
  decodeRefreshToken,
  encodeRefreshToken,
  hashRefreshSecret,
  newRefreshSecret,
  refreshTokenMaxAgeMs,
  signAccessToken,
} from './token.service';

/**
 * Two requests can refresh with the same cookie at once (two tabs, a flaky
 * connection retrying). Within this window the previous token still works;
 * after it, presenting the previous token is treated as theft.
 */
export const REFRESH_REUSE_GRACE_MS = 20_000;

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: IssuedTokens;
}

interface SessionMeta {
  userAgent?: string | undefined;
}

const sessionEnded = () => new AppError(401, 'SESSION_EXPIRED', 'Your session has ended. Sign in again.');

type UserFields = Pick<UserDoc, '_id' | 'name' | 'phone' | 'role' | 'branchId' | 'language' | 'familyId' | 'memberId'> &
  Partial<Pick<UserDoc, 'consentVersion' | 'deletionDueAt'>>;

export function toPublicUser(user: UserFields, familyStatus: FamilyStatus): PublicUser {
  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone,
    role: user.role,
    branchId: String(user.branchId),
    language: user.language,
    familyId: String(user.familyId),
    memberId: String(user.memberId),
    familyStatus,
    needsConsent: user.consentVersion !== PRIVACY_NOTICE_VERSION,
    deletionDueAt: user.deletionDueAt ? user.deletionDueAt.toISOString() : null,
  };
}

/** The public user with their family's current verification status. */
async function withFamilyStatus(user: UserFields): Promise<PublicUser> {
  const family = await FamilyModel.findById(user.familyId, { status: 1 }).lean();
  return toPublicUser(user, family?.status ?? 'pending');
}

// Verifying against a throwaway hash when the phone isn't registered keeps the
// response time the same, so timing doesn't reveal which numbers have accounts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= argon2.hash('not-a-real-password', { type: argon2.argon2id }));

async function startSession(userId: string, meta: SessionMeta): Promise<IssuedTokens> {
  const secret = newRefreshSecret();
  const session = await SessionModel.create({
    userId,
    tokenHash: hashRefreshSecret(secret),
    expiresAt: new Date(Date.now() + refreshTokenMaxAgeMs()),
    userAgent: meta.userAgent?.slice(0, 256) ?? null,
  });
  return {
    accessToken: await signAccessToken(userId),
    refreshToken: encodeRefreshToken(String(session._id), secret),
  };
}

export async function signup(input: z.output<typeof signupSchema>, meta: SessionMeta): Promise<AuthResult> {
  const branch = await BranchModel.findById(input.branchId).lean();
  if (!branch) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Pick your branch from the list.', [
      { path: 'branchId', message: 'validation.branchRequired' },
    ]);
  }

  // Someone already listed in a family joins it with an invite code instead of starting a duplicate.
  await assertPhoneFree(input.phone);

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  // Every account starts a family, of which it is the head. The family waits
  // for the branch committee to verify it.
  const userId = new Types.ObjectId();
  const family = await FamilyModel.create({
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    place: branch.name,
    history: [{ at: new Date(), action: 'created', byUserId: userId, byName: input.name, note: null }],
  });
  const member = await MemberModel.create({
    familyId: family._id,
    name: input.name,
    relation: 'head',
    isHead: true,
    gender: input.gender,
    phone: input.phone,
    userId,
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    place: family.place,
    familyStatus: family.status,
    consentByUserId: userId,
    consentAt: new Date(),
  });

  let user;
  try {
    user = await UserModel.create({
      _id: userId,
      phone: input.phone,
      name: input.name,
      passwordHash,
      branchId: branch._id,
      language: input.language,
      familyId: family._id,
      memberId: member._id,
      consentVersion: PRIVACY_NOTICE_VERSION,
      consentAt: new Date(),
    });
  } catch (err) {
    await Promise.all([member.deleteOne(), family.deleteOne()]);
    // Lost a race with a simultaneous signup for the same number.
    if ((err as { code?: number }).code === 11000) throw phoneTaken();
    throw err;
  }

  return { user: toPublicUser(user, family.status), tokens: await startSession(String(user._id), meta) };
}

/**
 * First sign-in for someone already listed in a family, with the invite code
 * the family or its committee gave them. The account joins that family as the
 * listed person; the family keeps its verification status, because the
 * committee already reviewed this person as part of the household.
 */
export async function join(input: z.output<typeof joinSchema>, meta: SessionMeta): Promise<AuthResult> {
  const invite = await checkInvite(input.phone, input.code);
  if (await UserModel.exists({ phone: input.phone })) throw phoneTaken();
  const family = await FamilyModel.findById(invite.familyId);
  if (!family) throw invalidInvite();
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  // Claim the person first, so two requests with the same code can't both succeed.
  const userId = new Types.ObjectId();
  const member = await MemberModel.findOneAndUpdate(
    { _id: invite.memberId, familyId: family._id, phone: input.phone, userId: null },
    { $set: { userId } },
    { returnDocument: 'after' },
  );
  if (!member) throw invalidInvite();

  let user;
  try {
    user = await UserModel.create({
      _id: userId,
      phone: input.phone,
      name: member.name,
      passwordHash,
      branchId: family.branchId,
      language: input.language,
      familyId: family._id,
      memberId: member._id,
      consentVersion: PRIVACY_NOTICE_VERSION,
      consentAt: new Date(),
    });
  } catch (err) {
    await MemberModel.updateOne({ _id: member._id }, { $set: { userId: null } });
    if ((err as { code?: number }).code === 11000) throw phoneTaken();
    throw err;
  }

  await invite.deleteOne();
  recordHistory(family, { id: String(userId), name: member.name }, 'joined');
  await family.save();
  logger.info({ userId: String(userId), familyId: String(family._id) }, 'Joined family with invite code');

  return { user: toPublicUser(user, family.status), tokens: await startSession(String(user._id), meta) };
}

export async function login(input: z.output<typeof loginSchema>, meta: SessionMeta): Promise<AuthResult> {
  const user = await UserModel.findOne({ phone: input.phone }).select('+passwordHash');
  const invalid = () =>
    new AppError(401, 'INVALID_CREDENTIALS', "That mobile number and password don't match. Check both and try again.");

  if (!user) {
    await argon2.verify(await getDummyHash(), input.password);
    throw invalid();
  }
  if (!(await argon2.verify(user.passwordHash, input.password))) throw invalid();

  if (argon2.needsRehash(user.passwordHash)) {
    user.passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    await user.save();
  }

  return { user: await withFamilyStatus(user), tokens: await startSession(String(user._id), meta) };
}

export async function refresh(refreshToken: string | undefined, attempt = 0): Promise<AuthResult> {
  const decoded = refreshToken ? decodeRefreshToken(refreshToken) : null;
  if (!decoded) throw sessionEnded();

  const session = await SessionModel.findById(decoded.sessionId);
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) throw sessionEnded();

  const presented = hashRefreshSecret(decoded.secret);
  const isCurrent = presented === session.tokenHash;
  const isPrevious = presented === session.previousTokenHash;
  const withinGrace = session.rotatedAt != null && Date.now() - session.rotatedAt.getTime() < REFRESH_REUSE_GRACE_MS;

  if (isPrevious && !withinGrace) {
    session.revokedAt = new Date();
    await session.save();
    logger.warn({ sessionId: decoded.sessionId, userId: String(session.userId) }, 'Refresh token reused; session revoked');
    throw sessionEnded();
  }
  if (!isCurrent && !isPrevious) throw sessionEnded();

  const secret = newRefreshSecret();
  const rotated = await SessionModel.findOneAndUpdate(
    { _id: session._id, tokenHash: session.tokenHash, revokedAt: null },
    { $set: { previousTokenHash: session.tokenHash, tokenHash: hashRefreshSecret(secret), rotatedAt: new Date() } },
  );
  // Another request rotated between our read and write. Try once more; the
  // presented token is now the previous one and falls inside the grace window.
  if (!rotated) {
    if (attempt > 0) throw sessionEnded();
    return refresh(refreshToken, attempt + 1);
  }

  const user = await UserModel.findById(session.userId).lean();
  if (!user) throw sessionEnded();

  return {
    user: await withFamilyStatus(user),
    tokens: {
      accessToken: await signAccessToken(String(user._id)),
      refreshToken: encodeRefreshToken(String(session._id), secret),
    },
  };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  const decoded = refreshToken ? decodeRefreshToken(refreshToken) : null;
  if (!decoded) return;
  await SessionModel.updateOne({ _id: decoded.sessionId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId).lean();
  if (!user) throw unauthenticated();
  return withFamilyStatus(user);
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<PublicUser> {
  const user = await UserModel.findByIdAndUpdate(userId, { $set: { language: input.language } }, { returnDocument: 'after' }).lean();
  if (!user) throw unauthenticated();
  return withFamilyStatus(user);
}
