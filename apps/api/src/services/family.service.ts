import { randomBytes } from 'node:crypto';
import {
  type FamilyDetail,
  type FamilyMember,
  type HistoryAction,
  type MemberInputParsed,
  PHOTO_MAX_BYTES,
  type familyUpdateSchema,
} from '@samaj/shared';
import { type HydratedDocument, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type FamilyDoc, FamilyModel, HISTORY_LIMIT } from '../models/family.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { UserModel } from '../models/user.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { storage } from '../utils/storage';
import { closeForRemovedMember, syncFamilyGotra, syncMember } from './matrimony.service';
import { canEditFamily, canResetPasswordFor, canReviewFamily, canSeeContact, canViewFamily, isOwnFamily } from './access';
import type { Viewer } from './viewer';

export const MAX_FAMILY_MEMBERS = 40;

type FamilyUpdate = z.output<typeof familyUpdateSchema>;
type FamilyDocument = HydratedDocument<FamilyDoc>;

const familyGone = () => notFound('That family is no longer in the directory.');

export function photoUrl(member: Pick<MemberDoc, '_id' | 'photoKey' | 'photoVersion'>): string | null {
  return member.photoKey ? `/api/members/${String(member._id)}/photo?v=${member.photoVersion}` : null;
}

export async function loadFamily(id: string): Promise<FamilyDocument> {
  if (!Types.ObjectId.isValid(id)) throw familyGone();
  const family = await FamilyModel.findById(id);
  if (!family) throw familyGone();
  return family;
}

export function recordHistory(family: FamilyDocument, viewer: Viewer, action: HistoryAction, note: string | null = null) {
  family.history.push({ at: new Date(), action, byUserId: new Types.ObjectId(viewer.id), byName: viewer.name, note });
  if (family.history.length > HISTORY_LIMIT) family.history.splice(0, family.history.length - HISTORY_LIMIT);
}

/** Load a family the viewer may change. Families they can't see are reported as missing, not forbidden. */
async function loadEditable(viewer: Viewer, familyId: string): Promise<FamilyDocument> {
  const family = await loadFamily(familyId);
  if (!canViewFamily(viewer, family)) throw familyGone();
  if (!canEditFamily(viewer, family)) throw forbidden("Only this family and its branch committee can change these details.");
  return family;
}

async function loadMemberOf(family: FamilyDocument, memberId: string) {
  if (!Types.ObjectId.isValid(memberId)) throw notFound('That person is no longer in this family.');
  const member = await MemberModel.findOne({ _id: memberId, familyId: family._id });
  if (!member) throw notFound('That person is no longer in this family.');
  return member;
}

const headRelationError = () =>
  new AppError(400, 'VALIDATION_FAILED', 'A family has one head. Pick another relation.', [
    { path: 'relation', message: 'validation.relationHead' },
  ]);

export async function getFamily(viewer: Viewer, familyId: string): Promise<FamilyDetail> {
  const family = await loadFamily(familyId);
  if (!canViewFamily(viewer, family)) throw familyGone();

  const [members, branch] = await Promise.all([
    MemberModel.find({ familyId: family._id }).sort({ isHead: -1, birthYear: 1, createdAt: 1 }).lean(),
    BranchModel.findById(family.branchId).lean(),
  ]);
  // Roles of the members who have accounts, to decide who may get a password reset code.
  const accountIds = members.flatMap((m) => (m.userId ? [m.userId] : []));
  const accounts = accountIds.length ? await UserModel.find({ _id: { $in: accountIds } }, { role: 1 }).lean() : [];
  const roleByUser = new Map(accounts.map((u) => [String(u._id), u.role]));

  const showContact = canSeeContact(viewer, { ...family.toObject(), familyId: family._id });
  const canEdit = canEditFamily(viewer, family);
  const canReview = canReviewFamily(viewer, family);

  const toMember = (m: (typeof members)[number]): FamilyMember => {
    const role = m.userId ? roleByUser.get(String(m.userId)) : undefined;
    const canResetPassword = role !== undefined && canResetPasswordFor(viewer, { id: String(m.userId), role }, family);
    return {
    id: String(m._id),
    name: m.name,
    relation: m.relation,
    gender: m.gender,
    birthYear: m.birthYear ?? null,
    occupation: m.occupation ?? null,
    education: m.education ?? null,
    ...(showContact && { phone: m.phone ?? null }),
    photoUrl: photoUrl(m),
    isHead: m.isHead,
    hasAccount: m.userId !== null,
    canResetPassword,
    ...(canResetPassword && { accountId: String(m.userId) }),
    };
  };

  const detail: FamilyDetail = {
    id: String(family._id),
    status: family.status,
    rejectionReason: family.rejectionReason ?? null,
    headName: members.find((m) => m.isHead)?.name ?? members[0]?.name ?? '',
    place: family.place,
    gotra: family.gotra ?? null,
    branch: { id: String(family.branchId), name: branch?.name ?? '', nameMr: branch?.nameMr ?? '' },
    members: members.map(toMember),
    createdAt: (family.createdAt ?? new Date()).toISOString(),
    permissions: {
      canEdit,
      canReview,
      canResubmit: isOwnFamily(viewer, family) && family.status === 'rejected',
    },
  };
  if (showContact) detail.address = family.address ?? null;
  if (canEdit || canReview) {
    detail.history = [...family.history].reverse().map((h) => ({
      at: h.at.toISOString(),
      action: h.action,
      byName: h.byName,
      note: h.note ?? null,
    }));
  }
  return detail;
}

export async function updateFamily(viewer: Viewer, familyId: string, input: FamilyUpdate): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  family.place = input.place;
  family.gotra = input.gotra;
  family.address = input.address;
  recordHistory(family, viewer, 'updated', 'Family details');
  await family.save();
  await MemberModel.updateMany({ familyId: family._id }, { $set: { place: family.place, gotra: family.gotra } });
  await syncFamilyGotra(family._id, family.gotra ?? null);
  return getFamily(viewer, familyId);
}

export async function addMember(viewer: Viewer, familyId: string, input: MemberInputParsed): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  if (input.relation === 'head') throw headRelationError();
  if ((await MemberModel.countDocuments({ familyId: family._id })) >= MAX_FAMILY_MEMBERS) {
    throw new AppError(400, 'VALIDATION_FAILED', `A family can list up to ${MAX_FAMILY_MEMBERS} people.`);
  }

  await MemberModel.create({
    ...input,
    familyId: family._id,
    isHead: false,
    branchId: family.branchId,
    branchAncestors: family.branchAncestors,
    place: family.place,
    gotra: family.gotra,
    familyStatus: family.status,
  });
  recordHistory(family, viewer, 'updated', `Added ${input.name}`);
  await family.save();
  return getFamily(viewer, familyId);
}

export async function updateMember(viewer: Viewer, familyId: string, memberId: string, input: MemberInputParsed): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);

  if (!member.isHead && input.relation === 'head') throw headRelationError();

  member.name = input.name;
  member.relation = member.isHead ? 'head' : input.relation;
  member.gender = input.gender;
  member.birthYear = input.birthYear;
  member.occupation = input.occupation;
  member.education = input.education;
  // An account holder's phone is their sign-in, so it can't be changed from here.
  if (!member.userId) member.phone = input.phone;
  await member.save();

  if (member.userId) await UserModel.updateOne({ _id: member.userId }, { $set: { name: member.name } });
  await syncMember(member);

  recordHistory(family, viewer, 'updated', `Updated ${member.name}`);
  await family.save();
  return getFamily(viewer, familyId);
}

export async function removeMember(viewer: Viewer, familyId: string, memberId: string): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);
  if (member.isHead || member.userId) {
    throw new AppError(400, 'FORBIDDEN', "The family head and people with their own account can't be removed.");
  }

  if (member.photoKey) await storage.remove(member.photoKey);
  await closeForRemovedMember(member._id);
  await member.deleteOne();
  recordHistory(family, viewer, 'updated', `Removed ${member.name}`);
  await family.save();
  return getFamily(viewer, familyId);
}

/** Recognise the image by its first bytes rather than trusting the Content-Type header. */
function imageType(data: Buffer): { ext: string; contentType: string } | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', contentType: 'image/webp' };
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export async function setPhoto(viewer: Viewer, familyId: string, memberId: string, data: Buffer): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);

  if (data.length > PHOTO_MAX_BYTES) {
    throw new AppError(400, 'VALIDATION_FAILED', 'The photo is too large.', [{ path: 'photo', message: 'validation.photoSize' }]);
  }
  const type = imageType(data);
  if (!type) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Upload a JPEG, PNG or WebP photo.', [{ path: 'photo', message: 'validation.photoType' }]);
  }

  const previous = member.photoKey;
  const key = `members/${String(member._id)}-${randomBytes(6).toString('hex')}.${type.ext}`;
  await storage.put(key, data);
  member.photoKey = key;
  member.photoVersion += 1;
  await member.save();
  if (previous) await storage.remove(previous);

  return getFamily(viewer, familyId);
}

export async function removePhoto(viewer: Viewer, familyId: string, memberId: string): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);
  if (member.photoKey) {
    await storage.remove(member.photoKey);
    member.photoKey = null;
    member.photoVersion += 1;
    await member.save();
  }
  return getFamily(viewer, familyId);
}

/** The photo bytes, if the viewer may see this member's family. */
export async function getPhoto(viewer: Viewer, memberId: string): Promise<{ data: Buffer; contentType: string }> {
  const missing = () => notFound('No photo here.');
  if (!Types.ObjectId.isValid(memberId)) throw missing();
  const member = await MemberModel.findById(memberId).lean();
  if (!member?.photoKey) throw missing();

  const familyLike = { _id: member.familyId, status: member.familyStatus, branchId: member.branchId, branchAncestors: member.branchAncestors };
  if (!canViewFamily(viewer, familyLike)) throw missing();

  const data = await storage.read(member.photoKey);
  if (!data) throw missing();
  const ext = member.photoKey.split('.').pop() ?? 'jpg';
  return { data, contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream' };
}

