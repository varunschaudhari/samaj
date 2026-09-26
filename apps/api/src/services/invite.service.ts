import type { InviteCode } from '@samaj/shared';
import { Types } from 'mongoose';
import { InviteModel } from '../models/invite.model';
import { MemberModel } from '../models/member.model';
import { UserModel } from '../models/user.model';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { codeMatches, hashCode, newCode } from '../utils/one-time-code';
import { loadEditable, loadMemberOf, recordHistory } from './family.service';
import { phoneTaken } from './phones';
import type { Viewer } from './viewer';

/** Long enough to reach an elder over a weekend; short enough that a lost code soon stops working. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
export const MAX_INVITE_ATTEMPTS = 5;

/**
 * The family (or its committee) creates a code for someone listed in it, so
 * they can sign in to this family with their own number. Their number on the
 * family record becomes their sign-in.
 */
export async function createInvite(viewer: Viewer, familyId: string, memberId: string): Promise<InviteCode> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);
  if (member.userId) throw new AppError(409, 'CONFLICT', `${member.name} already has their own sign-in.`);
  if (!member.phone) {
    throw new AppError(400, 'VALIDATION_FAILED', `Add ${member.name}'s mobile number first. They will sign in with it.`, [
      { path: 'phone', message: 'validation.phoneNeeded' },
    ]);
  }
  if (await UserModel.exists({ phone: member.phone })) throw phoneTaken();

  const code = newCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  // One live code per person: a new code replaces the old one.
  await InviteModel.findOneAndUpdate(
    { memberId: member._id },
    { $set: { familyId: family._id, codeHash: hashCode(code), createdByUserId: new Types.ObjectId(viewer.id), expiresAt, attempts: 0 } },
    { upsert: true },
  );
  recordHistory(family, viewer, 'invited', member.name);
  await family.save();
  logger.info({ memberId: String(member._id), byUserId: viewer.id }, 'Invite code created');
  return { code, expiresAt: expiresAt.toISOString() };
}

export const invalidInvite = () =>
  new AppError(400, 'INVALID_INVITE_CODE', "That code isn't valid for this mobile number, or it has expired. Ask for a new one.", [
    { path: 'code', message: 'validation.inviteCode' },
  ]);

/**
 * The person listed with this number whose invite matches the code. Wrong
 * guesses count against the invite. The same answer is given whether or not
 * the number is listed, so the screen doesn't reveal who is in the directory.
 */
export async function checkInvite(phone: string, code: string) {
  const listed = await MemberModel.find({ phone, userId: null }, { _id: 1 }).lean();
  if (listed.length === 0) throw invalidInvite();
  const invite = await InviteModel.findOne({ memberId: { $in: listed.map((m) => m._id) } }).sort({ createdAt: -1 });
  if (!invite || invite.expiresAt.getTime() <= Date.now() || invite.attempts >= MAX_INVITE_ATTEMPTS) throw invalidInvite();
  if (!codeMatches(invite.codeHash, code)) {
    invite.attempts += 1;
    await invite.save();
    throw invalidInvite();
  }
  return invite;
}
