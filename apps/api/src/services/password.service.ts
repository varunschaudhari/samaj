import argon2 from 'argon2';
import { type ResetCode, type changePasswordSchema, type resetPasswordSchema } from '@samaj/shared';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { FamilyModel } from '../models/family.model';
import { PasswordResetModel } from '../models/password-reset.model';
import { SessionModel } from '../models/session.model';
import { UserModel } from '../models/user.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { logger } from '../utils/logger';
import { codeMatches, hashCode, newCode } from '../utils/one-time-code';
import { canResetPasswordFor } from './access';
import { decodeRefreshToken } from './token.service';
import type { Viewer } from './viewer';

export const RESET_CODE_TTL_MS = 30 * 60_000;
export const MAX_RESET_ATTEMPTS = 5;

/** Sign an account out everywhere, optionally keeping the session making the request. */
async function revokeSessions(userId: Types.ObjectId, keepSessionId?: string) {
  await SessionModel.updateMany(
    { userId, revokedAt: null, ...(keepSessionId && Types.ObjectId.isValid(keepSessionId) && { _id: { $ne: new Types.ObjectId(keepSessionId) } }) },
    { $set: { revokedAt: new Date() } },
  );
}

/** A committee member or admin creates a one-time code to hand to the member, by phone or in person. */
export async function createResetCode(viewer: Viewer, userId: string): Promise<ResetCode> {
  if (!Types.ObjectId.isValid(userId)) throw notFound('That account no longer exists.');
  const user = await UserModel.findById(userId, { role: 1, familyId: 1 }).lean();
  if (!user) throw notFound('That account no longer exists.');
  const family = await FamilyModel.findById(user.familyId, { branchId: 1, branchAncestors: 1 }).lean();
  if (!family || !canResetPasswordFor(viewer, { id: String(user._id), role: user.role }, family)) {
    throw forbidden(String(user._id) === viewer.id ? 'Use Change password on your profile instead.' : 'Only the branch committee or an admin can do this for this account.');
  }

  const code = newCode();
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  // One live code per account: a new code replaces the old one.
  await PasswordResetModel.findOneAndUpdate(
    { userId: user._id },
    { $set: { codeHash: hashCode(code), createdByUserId: new Types.ObjectId(viewer.id), expiresAt, attempts: 0 } },
    { upsert: true },
  );
  logger.info({ userId: String(user._id), byUserId: viewer.id }, 'Password reset code created');
  return { code, expiresAt: expiresAt.toISOString() };
}

const invalidCode = () =>
  new AppError(400, 'INVALID_RESET_CODE', "That code isn't valid or has expired. Ask your committee member for a new one.", [
    { path: 'code', message: 'validation.resetCode' },
  ]);

/** Public: set a new password with a code. Signs the account out everywhere. */
export async function resetPassword(input: z.output<typeof resetPasswordSchema>): Promise<void> {
  const user = await UserModel.findOne({ phone: input.phone }, { _id: 1 }).lean();
  // Same answer whether or not the number has an account.
  if (!user) throw invalidCode();
  const reset = await PasswordResetModel.findOne({ userId: user._id });
  if (!reset || reset.expiresAt.getTime() <= Date.now() || reset.attempts >= MAX_RESET_ATTEMPTS) throw invalidCode();

  if (!codeMatches(reset.codeHash, input.code)) {
    reset.attempts += 1;
    await reset.save();
    throw invalidCode();
  }

  await UserModel.updateOne({ _id: user._id }, { $set: { passwordHash: await argon2.hash(input.password, { type: argon2.argon2id }) } });
  await reset.deleteOne();
  await revokeSessions(user._id);
  logger.info({ userId: String(user._id) }, 'Password reset with code');
}

/** Signed in: change your own password. Other devices are signed out; this one stays. */
export async function changePassword(viewer: Viewer, input: z.output<typeof changePasswordSchema>, refreshToken: string | undefined): Promise<void> {
  const user = await UserModel.findById(viewer.id).select('+passwordHash');
  if (!user) throw notFound('That account no longer exists.');
  if (!(await argon2.verify(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', "Your current password isn't right.", [
      { path: 'currentPassword', message: 'validation.currentPasswordWrong' },
    ]);
  }
  user.passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
  await user.save();
  await revokeSessions(user._id, refreshToken ? decodeRefreshToken(refreshToken)?.sessionId : undefined);
}
