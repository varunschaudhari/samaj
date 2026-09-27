import {
  DELETION_GRACE_DAYS,
  type DeletionScope,
  PRIVACY_NOTICE_VERSION,
  type PrivacyInfo,
  type PrivacyStatus,
  type memberPrivacySchema,
} from '@samaj/shared';
import argon2 from 'argon2';
import { Types } from 'mongoose';
import type { z } from 'zod';
import { env } from '../config/env';
import { BranchModel } from '../models/branch.model';
import { EventModel } from '../models/event.model';
import { FamilyLinkModel } from '../models/family-link.model';
import { FamilyModel } from '../models/family.model';
import { InterestModel } from '../models/interest.model';
import { InviteModel } from '../models/invite.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { MemberMoveModel } from '../models/member-move.model';
import { NoticeModel } from '../models/notice.model';
import { OfficeBearerModel } from '../models/office-bearer.model';
import { PasswordResetModel } from '../models/password-reset.model';
import { ProfileModel } from '../models/profile.model';
import { RoleChangeModel } from '../models/role-change.model';
import { RsvpModel } from '../models/rsvp.model';
import { SessionModel } from '../models/session.model';
import { UserModel } from '../models/user.model';
import { AppError, forbidden, notFound, unauthenticated } from '../utils/app-error';
import { invalidate } from '../utils/cache';
import { logger } from '../utils/logger';
import { storage } from '../utils/storage';
import { canEditFamily } from './access';
import { getFamily, loadFamily } from './family.service';
import { closeForRemovedMember } from './matrimony.service';
import type { Viewer } from './viewer';

type MemberPrivacy = z.output<typeof memberPrivacySchema>;

const DAY = 24 * 60 * 60 * 1000;
/** What stays in other people's records (histories, notices) in place of an erased name. */
const FORMER = 'Former member';

export function privacyInfo(): PrivacyInfo {
  return {
    version: PRIVACY_NOTICE_VERSION,
    contact: { name: env.PRIVACY_CONTACT_NAME ?? null, email: env.PRIVACY_CONTACT_EMAIL ?? null, phone: env.PRIVACY_CONTACT_PHONE ?? null },
  };
}

async function loadSelf(viewer: Viewer) {
  const user = await UserModel.findById(viewer.id);
  if (!user) throw unauthenticated();
  const member = await MemberModel.findById(user.memberId);
  if (!member) throw notFound('Your record is no longer there.');
  return { user, member };
}

/** Which deletions this person may ask for. */
async function deletionRules(user: { _id: Types.ObjectId; role: string; familyId: Types.ObjectId }, member: Pick<MemberDoc, 'isHead'>) {
  const lastSuperadmin = user.role === 'superadmin' && (await UserModel.countDocuments({ role: 'superadmin' })) <= 1;
  const [others, otherAccounts] = await Promise.all([
    MemberModel.countDocuments({ familyId: user.familyId, userId: { $ne: user._id } }),
    UserModel.countDocuments({ familyId: user.familyId, _id: { $ne: user._id } }),
  ]);
  // A head who is alone in the family deletes the family either way.
  const deleteSelfBlockedBy = lastSuperadmin ? 'lastSuperadmin' : member.isHead && others > 0 ? 'isHead' : null;
  const deleteFamilyBlockedBy = !member.isHead ? 'notHead' : otherAccounts > 0 ? 'otherAccounts' : null;
  return {
    deleteSelfBlockedBy,
    deleteFamilyBlockedBy,
    canDeleteSelf: deleteSelfBlockedBy === null,
    // The last super admin can't go either way.
    canDeleteFamily: deleteFamilyBlockedBy === null && !lastSuperadmin,
  } as const;
}

export async function getStatus(viewer: Viewer): Promise<PrivacyStatus> {
  const { user, member } = await loadSelf(viewer);
  const rules = await deletionRules(user, member);
  return {
    noticeVersion: PRIVACY_NOTICE_VERSION,
    consentedAt: user.consentVersion === PRIVACY_NOTICE_VERSION && user.consentAt ? user.consentAt.toISOString() : null,
    phoneVisibility: member.phoneVisibility,
    listed: member.listed,
    ...rules,
    deletion: user.deletionScope && user.deletionDueAt ? { scope: user.deletionScope, dueAt: user.deletionDueAt.toISOString() } : null,
  };
}

export async function consent(viewer: Viewer): Promise<PrivacyStatus> {
  await UserModel.updateOne({ _id: viewer.id }, { $set: { consentVersion: PRIVACY_NOTICE_VERSION, consentAt: new Date() } });
  logger.info({ userId: viewer.id, version: PRIVACY_NOTICE_VERSION }, 'Privacy notice agreed');
  return getStatus(viewer);
}

/** An account holder sets their own; the family (or its committee) sets them for people without an account. */
export async function setMemberPrivacy(viewer: Viewer, memberId: string, input: MemberPrivacy): Promise<void> {
  if (!Types.ObjectId.isValid(memberId)) throw notFound('That person is no longer in this family.');
  const member = await MemberModel.findById(memberId);
  if (!member) throw notFound('That person is no longer in this family.');
  const family = await loadFamily(String(member.familyId));
  const allowed = member.userId ? String(member.userId) === viewer.id : canEditFamily(viewer, family);
  if (!allowed) throw forbidden(member.userId ? 'Only this person can change their own privacy settings.' : 'Only this family can change these settings.');
  member.phoneVisibility = input.phoneVisibility;
  member.listed = input.listed;
  await member.save();
}

/** Everything held about this person and their family, as one JSON document. */
export async function exportData(viewer: Viewer): Promise<Record<string, unknown>> {
  const { user, member } = await loadSelf(viewer);
  const [family, branch, sessions, roleChanges, profiles, interests, rsvps] = await Promise.all([
    getFamily(viewer, String(user.familyId)),
    BranchModel.findById(user.branchId, { name: 1, nameMr: 1 }).lean(),
    SessionModel.find({ userId: user._id }, { tokenHash: 0, previousTokenHash: 0 }).sort({ createdAt: -1 }).lean(),
    RoleChangeModel.find({ userId: user._id }).lean(),
    ProfileModel.find({ familyId: user.familyId }).lean(),
    InterestModel.find({ $or: [{ fromFamilyId: user.familyId }, { toFamilyId: user.familyId }] }).lean(),
    RsvpModel.find({ familyId: user.familyId }).lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    privacyNotice: { version: PRIVACY_NOTICE_VERSION, agreedVersion: user.consentVersion, agreedAt: user.consentAt },
    account: {
      name: user.name,
      phone: user.phone,
      role: user.role,
      language: user.language,
      branch: branch ? { name: branch.name, nameMr: branch.nameMr } : null,
      createdAt: user.createdAt,
    },
    you: {
      name: member.name,
      relation: member.relation,
      gender: member.gender,
      birthYear: member.birthYear,
      occupation: member.occupation,
      education: member.education,
      phone: member.phone,
      hasPhoto: Boolean(member.photoKey),
      phoneVisibility: member.phoneVisibility,
      listedInDirectory: member.listed,
    },
    family,
    matrimonyProfiles: profiles.map(({ _id, ...p }) => ({ id: String(_id), ...p })),
    matrimonyInterests: interests.map(({ _id, ...i }) => ({ id: String(_id), ...i })),
    eventReplies: rsvps.map(({ _id, ...r }) => ({ id: String(_id), ...r })),
    roleChanges: roleChanges.map(({ _id, ...r }) => ({ id: String(_id), ...r })),
    signIns: sessions.map((s) => ({ startedAt: s.createdAt, device: s.userAgent, endedAt: s.revokedAt, expiresAt: s.expiresAt })),
  };
}

export async function requestDeletion(viewer: Viewer, scope: DeletionScope, password: string): Promise<PrivacyStatus> {
  const user = await UserModel.findById(viewer.id).select('+passwordHash');
  if (!user) throw unauthenticated();
  if (!(await argon2.verify(user.passwordHash, password))) {
    throw new AppError(400, 'VALIDATION_FAILED', 'That password isn’t right.', [{ path: 'password', message: 'validation.passwordWrong' }]);
  }
  const member = await MemberModel.findById(user.memberId);
  if (!member) throw notFound('Your record is no longer there.');
  const rules = await deletionRules(user, member);
  const blocked = scope === 'self' ? rules.deleteSelfBlockedBy : rules.deleteFamilyBlockedBy;
  if (blocked || (scope === 'family' && !rules.canDeleteFamily)) {
    const key = blocked === 'isHead' ? 'validation.deletionIsHead' : blocked === 'notHead' ? 'validation.deletionNotHead' : blocked === 'otherAccounts' ? 'validation.deletionOtherAccounts' : 'validation.deletionLastSuperadmin';
    throw new AppError(409, 'CONFLICT', 'That deletion isn’t possible for this account.', [{ path: 'scope', message: key }]);
  }
  user.deletionScope = scope;
  user.deletionDueAt = new Date(Date.now() + DELETION_GRACE_DAYS * DAY);
  await user.save();
  logger.info({ userId: viewer.id, scope, dueAt: user.deletionDueAt }, 'Deletion requested');
  return getStatus(viewer);
}

export async function cancelDeletion(viewer: Viewer): Promise<PrivacyStatus> {
  await UserModel.updateOne({ _id: viewer.id }, { $set: { deletionScope: null, deletionDueAt: null } });
  logger.info({ userId: viewer.id }, 'Deletion cancelled');
  return getStatus(viewer);
}

/** A person's record and everything that hangs off it. */
async function erasePerson(member: MemberDoc) {
  if (member.photoKey) await storage.remove(member.photoKey);
  await closeForRemovedMember(member._id);
  await Promise.all([InviteModel.deleteMany({ memberId: member._id }), MemberMoveModel.deleteMany({ memberId: member._id })]);
  await MemberModel.deleteOne({ _id: member._id });
}

/** An account, and its name wherever other records mention it. */
async function eraseAccount(user: { _id: Types.ObjectId; phone: string }) {
  const id = user._id;
  await Promise.all([
    SessionModel.deleteMany({ userId: id }),
    PasswordResetModel.deleteMany({ userId: id }),
    RoleChangeModel.deleteMany({ userId: id }),
    OfficeBearerModel.deleteMany({ phone: user.phone }),
    FamilyModel.updateMany({ 'history.byUserId': id }, { $set: { 'history.$[h].byName': FORMER } }, { arrayFilters: [{ 'h.byUserId': id }] }),
    NoticeModel.updateMany({ authorUserId: id }, { $set: { authorName: FORMER } }),
    EventModel.updateMany({ createdByUserId: id }, { $set: { createdByName: FORMER } }),
    FamilyLinkModel.updateMany({ requestedByUserId: id }, { $set: { requestedByName: FORMER } }),
    MemberMoveModel.updateMany({ requestedByUserId: id }, { $set: { requestedByName: FORMER } }),
    RoleChangeModel.updateMany({ byUserId: id }, { $set: { byName: FORMER } }),
  ]);
  await UserModel.deleteOne({ _id: id });
}

async function eraseFamily(familyId: Types.ObjectId) {
  const members = await MemberModel.find({ familyId }).lean();
  for (const m of members) await erasePerson(m);
  await Promise.all([
    FamilyLinkModel.deleteMany({ $or: [{ fromFamilyId: familyId }, { toFamilyId: familyId }] }),
    MemberMoveModel.deleteMany({ $or: [{ fromFamilyId: familyId }, { toFamilyId: familyId }] }),
    InterestModel.deleteMany({ $or: [{ fromFamilyId: familyId }, { toFamilyId: familyId }] }),
    RsvpModel.deleteMany({ familyId }),
  ]);
  await FamilyModel.deleteOne({ _id: familyId });
}

/** Carries out one user's scheduled deletion now. */
export async function eraseUser(userId: Types.ObjectId): Promise<void> {
  const user = await UserModel.findById(userId).lean();
  if (!user) return;
  const member = await MemberModel.findById(user.memberId).lean();
  const alone = member ? (await MemberModel.countDocuments({ familyId: user.familyId })) <= 1 : true;
  if (user.deletionScope === 'family' || alone) {
    await eraseAccount(user);
    await eraseFamily(user.familyId);
  } else {
    if (member) await erasePerson(member);
    await eraseAccount(user);
  }
  invalidate('');
  logger.info({ userId: String(userId), scope: user.deletionScope }, 'Personal data erased');
}

/** Erase every deletion that is due. Runs hourly in the API and from `npm run privacy:purge`. */
export async function purgeDue(now = new Date()): Promise<number> {
  const due = await UserModel.find({ deletionDueAt: { $lte: now } }, { _id: 1 }).lean();
  for (const u of due) {
    try {
      await eraseUser(u._id);
    } catch (err) {
      logger.error({ err, userId: String(u._id) }, 'Erasing personal data failed; will retry');
    }
  }
  return due.length;
}
