import { randomBytes } from 'node:crypto';
import {
  type FamilyDetail,
  type FamilyMember,
  type HistoryAction,
  MAX_FAMILY_LINKS,
  type MemberInputParsed,
  PARENT_CHOICES,
  PARTNER_CHOICES,
  PHOTO_MAX_BYTES,
  SPOUSE_RELATIONS,
  type enrolFamilySchema,
  type familyUpdateSchema,
} from '@samaj/shared';
import { type HydratedDocument, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { type FamilyDoc, FamilyModel, HISTORY_LIMIT } from '../models/family.model';
import { InviteModel } from '../models/invite.model';
import { type MemberDoc, MemberModel } from '../models/member.model';
import { SamePersonModel } from '../models/same-person.model';
import { UserModel } from '../models/user.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { storage } from '../utils/storage';
import { closeForRemovedMember, syncFamilyGotra, syncMember } from './matrimony.service';
import { canEditFamily, canEnrolIn, canResetPasswordFor, canReviewFamily, canSeeContact, canSeePhone, canSeeTree, canViewFamily, hasReach, isOwnFamily } from './access';
import { actsForOwnFamily, familySummaries, linksOf, movedInFrom, movesOutOf } from './links.service';
import { assertPhoneFree } from './phones';
import type { Viewer } from './viewer';

export const MAX_FAMILY_MEMBERS = 40;

type FamilyUpdate = z.output<typeof familyUpdateSchema>;
type EnrolFamily = z.output<typeof enrolFamilySchema>;
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

export function recordHistory(family: FamilyDocument, viewer: Pick<Viewer, 'id' | 'name'>, action: HistoryAction, note: string | null = null) {
  family.history.push({ at: new Date(), action, byUserId: new Types.ObjectId(viewer.id), byName: viewer.name, note });
  if (family.history.length > HISTORY_LIMIT) family.history.splice(0, family.history.length - HISTORY_LIMIT);
}

/** Load a family the viewer may change. Families they can't see are reported as missing, not forbidden. */
export async function loadEditable(viewer: Viewer, familyId: string): Promise<FamilyDocument> {
  const family = await loadFamily(familyId);
  if (!canViewFamily(viewer, family)) throw familyGone();
  if (!canEditFamily(viewer, family)) throw forbidden("Only this family and its branch committee can change these details.");
  return family;
}

export async function loadMemberOf(family: FamilyDocument, memberId: string) {
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

  const canEdit = canEditFamily(viewer, family);
  const canReview = canReviewFamily(viewer, family);
  // People waiting for the committee show only to the family and its reviewers.
  const seesPending = canEdit || hasReach(viewer, 'member:verify', family);
  const [members, branch, links] = await Promise.all([
    // Others don't see people waiting for approval, or people who asked not to be listed.
    MemberModel.find({ familyId: family._id, ...(!seesPending && { approval: { $ne: 'pending' }, listed: { $ne: false } }) })
      .sort({ isHead: -1, birthYear: 1, createdAt: 1 })
      .lean(),
    BranchModel.findById(family.branchId).lean(),
    linksOf(viewer, family),
  ]);
  // Roles of the members who have accounts, to decide who may get a password reset code.
  const [movedOut, cameFrom] = await Promise.all([
    movesOutOf(viewer, [String(family._id)]),
    movedInFrom(viewer, family._id, members.map((m) => m._id)),
  ]);
  // Parents listed in other families, for those who may see them.
  const externalIds = members.flatMap((m) => (m.externalParentId ? [m.externalParentId] : []));
  const externalPeople = externalIds.length ? await MemberModel.find({ _id: { $in: externalIds } }, { name: 1, familyId: 1 }).lean() : [];
  const externalFamilies = await familySummaries(viewer, [
    ...externalPeople.map((p) => p.familyId),
    // Birth families of adopted people, for those who see adoption.
    ...(seesPending ? members.flatMap((m) => (m.birthFamilyId ? [m.birthFamilyId] : [])) : []),
  ]);
  const externalOf = (id: unknown) => {
    const p = id ? externalPeople.find((x) => String(x._id) === String(id)) : undefined;
    const f = p ? externalFamilies.get(String(p.familyId)) : undefined;
    return p && f && (f.canView || canEdit) ? { id: String(p._id), name: p.name, family: f } : undefined;
  };
  const accountIds = members.flatMap((m) => (m.userId ? [m.userId] : []));
  const accounts = accountIds.length ? await UserModel.find({ _id: { $in: accountIds } }, { role: 1 }).lean() : [];
  const roleByUser = new Map(accounts.map((u) => [String(u._id), u.role]));

  const showContact = canSeeContact(viewer, { ...family.toObject(), familyId: family._id });
  const fromOwnFamily = actsForOwnFamily(viewer, family);

  // Other families show only if the viewer may open them, as with links; the family itself sees all.
  const maher = (id: Types.ObjectId) => {
    const from = cameFrom.get(String(id));
    return from && (from.canView || canEdit) ? from : undefined;
  };
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
    ...(canSeePhone(viewer, m) && { phone: m.phone ?? null }),
    photoUrl: photoUrl(m),
    isHead: m.isHead,
    hasAccount: m.userId !== null,
    canResetPassword,
    ...(canResetPassword && { accountId: String(m.userId) }),
    canInvite: canEdit && m.userId === null && m.approval !== 'pending' && !m.deceased,
    // Records from before approvals existed have no value: they were listed already.
    approval: m.approval ?? 'approved',
    ...(seesPending && { privacy: { phoneVisibility: m.phoneVisibility ?? 'committee', listed: m.listed !== false } }),
    // An account holder decides for themselves; the family decides for those without one.
    canEditPrivacy: m.deceased ? false : m.userId ? String(m.userId) === viewer.id : canEdit,
    deceased: m.deceased === true,
    deathYear: m.deathYear ?? null,
    parentId: m.parentId ? String(m.parentId) : null,
    partnerId: m.partnerId ? String(m.partnerId) : null,
    otherParentId: m.otherParentId ? String(m.otherParentId) : null,
    formerPartner: m.formerPartner === true,
    maidenName: m.maidenName ?? null,
    ...(seesPending && { adopted: m.adopted === true }),
    ...(externalOf(m.externalParentId) && { externalParent: externalOf(m.externalParentId) }),
    ...(seesPending && m.birthFamilyId && externalFamilies.get(String(m.birthFamilyId)) && { birthFamily: externalFamilies.get(String(m.birthFamilyId)) }),
    ...(maher(m._id) && { movedFrom: maher(m._id) }),
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
      canLink: fromOwnFamily && !links.some((l) => l.family.id === viewer.familyId) && links.length < MAX_FAMILY_LINKS,
      canRequestMove: fromOwnFamily,
      canViewTree: canSeeTree(viewer, family, links.some((l) => l.family.id === viewer.familyId)),
    },
    ...(canEdit && { treeVisibility: family.treeVisibility ?? 'all' }),
    links,
    movedOut: movedOut
      .filter((o) => (o.family.canView || canEdit) && (seesPending || o.member.listed !== false))
      .map((o) => ({ memberId: String(o.member._id), name: o.member.name, relation: o.relation, gender: o.member.gender, family: o.family, at: o.at.toISOString() })),
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

/** A committee member or admin registers a family and its head. The family starts verified: its reviewer created it. */
export async function enrolFamily(viewer: Viewer, input: EnrolFamily): Promise<FamilyDetail> {
  const branch = await BranchModel.findById(input.branchId).lean();
  if (!branch) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Pick the branch from the list.', [{ path: 'branchId', message: 'validation.branchRequired' }]);
  }
  if (!canEnrolIn(viewer, { branchId: branch._id, branchAncestors: branch.ancestors })) {
    throw forbidden('You can enrol families only in your own branch and the branches inside it.');
  }
  if (input.head.phone) await assertPhoneFree(input.head.phone, 'head.phone');

  const now = new Date();
  const by = { byUserId: new Types.ObjectId(viewer.id), byName: viewer.name };
  const family = await FamilyModel.create({
    branchId: branch._id,
    branchAncestors: branch.ancestors,
    place: input.place ?? branch.name,
    gotra: input.gotra,
    address: input.address,
    status: 'verified',
    submittedAt: now,
    reviewedAt: now,
    reviewedByUserId: by.byUserId,
    history: [
      { at: now, action: 'created', ...by, note: 'Enrolled by the committee' },
      { at: now, action: 'verified', ...by, note: null },
    ],
  });
  try {
    await MemberModel.create({
      ...input.head,
      consentByUserId: new Types.ObjectId(viewer.id),
      consentAt: now,
      relation: 'head',
      isHead: true,
      familyId: family._id,
      branchId: family.branchId,
      branchAncestors: family.branchAncestors,
      place: family.place,
      gotra: family.gotra,
      familyStatus: family.status,
    });
  } catch (err) {
    await family.deleteOne();
    throw err;
  }
  return getFamily(viewer, String(family._id));
}

export async function updateFamily(viewer: Viewer, familyId: string, input: FamilyUpdate): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  family.place = input.place;
  family.gotra = input.gotra;
  family.address = input.address;
  if (input.treeVisibility && input.treeVisibility !== (family.treeVisibility ?? 'all')) {
    family.treeVisibility = input.treeVisibility;
    recordHistory(family, viewer, 'updated', `Family tree shown to: ${{ all: 'everyone who can see the family', linked: 'linked families', family: 'the family only' }[input.treeVisibility]}`);
  }
  recordHistory(family, viewer, 'updated', 'Family details');
  await family.save();
  await MemberModel.updateMany({ familyId: family._id }, { $set: { place: family.place, gotra: family.gotra } });
  await syncFamilyGotra(family._id, family.gotra ?? null);
  return getFamily(viewer, familyId);
}

/**
 * A chosen parent or partner must be someone in the same family whose
 * relation fits: a grandchild's parent is a son or daughter, a
 * daughter-in-law's husband a son.
 */
async function checkTies(familyId: Types.ObjectId, input: MemberInputParsed, self?: Types.ObjectId, viewer?: Viewer) {
  if (input.birthFamilyId) {
    const birth = input.birthFamilyId === String(familyId) ? null : await FamilyModel.findById(input.birthFamilyId, { history: 0 }).lean();
    if (!birth || (viewer && !canViewFamily(viewer, birth))) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Pick the family they were born into from the directory.', [{ path: 'birthFamilyId', message: 'validation.birthFamily' }]);
    }
  }
  const ties = [
    ['parentId', input.parentId, PARENT_CHOICES[input.relation]],
    ['partnerId', input.partnerId, PARTNER_CHOICES[input.relation]],
    // A child's other parent is one of their parent's spouses; the tree checks which.
    ['otherParentId', input.otherParentId, SPOUSE_RELATIONS],
  ] as const;
  for (const [path, id, allowed] of ties) {
    if (!id) continue;
    const other = self && String(self) === id ? null : await MemberModel.findOne({ _id: id, familyId }, { relation: 1 }).lean();
    if (!other || !allowed?.includes(other.relation)) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Pick someone from this family.', [{ path, message: 'validation.tieChoice' }]);
    }
  }
}

/** Nobody points at someone who left or whose relation no longer fits. */
async function untie(familyId: Types.ObjectId, memberId: Types.ObjectId) {
  await Promise.all([
    MemberModel.updateMany({ familyId, parentId: memberId }, { $set: { parentId: null } }),
    MemberModel.updateMany({ familyId, partnerId: memberId }, { $set: { partnerId: null } }),
    MemberModel.updateMany({ familyId, otherParentId: memberId }, { $set: { otherParentId: null } }),
  ]);
}

export async function addMember(viewer: Viewer, familyId: string, input: MemberInputParsed): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  if (input.relation === 'head') throw headRelationError();
  if ((await MemberModel.countDocuments({ familyId: family._id })) >= MAX_FAMILY_MEMBERS) {
    throw new AppError(400, 'VALIDATION_FAILED', `A family can list up to ${MAX_FAMILY_MEMBERS} people.`);
  }

  await checkTies(family._id, input, undefined, viewer);
  // A verified family's additions wait for the committee, unless a reviewer added them.
  const waits = family.status === 'verified' && !canReviewFamily(viewer, family);
  await MemberModel.create({
    ...input,
    familyId: family._id,
    isHead: false,
    branchId: family.branchId,
    branchAncestors: family.branchAncestors,
    place: family.place,
    gotra: family.gotra,
    familyStatus: waits ? 'pending' : family.status,
    approval: waits ? 'pending' : 'approved',
    addedByName: viewer.name,
    consentByUserId: input.deceased ? null : new Types.ObjectId(viewer.id),
    consentAt: input.deceased ? null : new Date(),
  });
  recordHistory(family, viewer, 'updated', waits ? `Added ${input.name}, waiting for the committee` : `Added ${input.name}`);
  await family.save();
  return getFamily(viewer, familyId);
}

/** How the history names each field a person's edit changed. */
const CHANGE_LABELS: Record<string, string> = {
  name: 'name',
  relation: 'relation',
  gender: 'gender',
  birthYear: 'birth year',
  occupation: 'work',
  education: 'education',
  phone: 'mobile number',
  deathYear: 'year of passing',
  parentId: 'parent',
  partnerId: 'wife or husband',
  otherParentId: 'other parent',
  birthFamilyId: 'birth family',
  maidenName: 'name before marriage',
};

/** "birth year, parent (Rohit Wagh), passed away": what an edit changed, for the family's history. */
async function describeChanges(member: HydratedDocument<MemberDoc>, oldName: string): Promise<string[]> {
  const nameOf = async (id: unknown) => (id ? ((await MemberModel.findById(id, { name: 1 }).lean())?.name ?? null) : null);
  return Promise.all(
    member.directModifiedPaths().flatMap((path): (string | Promise<string>)[] => {
      switch (path) {
        case 'deceased':
          return [member.deceased ? 'passed away' : 'no longer marked as passed away'];
        case 'adopted':
          return [member.adopted ? 'adopted' : 'no longer marked adopted'];
        case 'formerPartner':
          return [member.formerPartner ? 'no longer married' : 'married'];
        case 'name':
          return [`name (was ${oldName})`];
        case 'parentId':
        case 'partnerId':
        case 'otherParentId':
          return [nameOf(member.get(path)).then((name) => (name ? `${CHANGE_LABELS[path]} (${name})` : `${CHANGE_LABELS[path]} removed`))];
        default:
          return CHANGE_LABELS[path] ? [CHANGE_LABELS[path]] : [];
      }
    }),
  );
}

export async function updateMember(viewer: Viewer, familyId: string, memberId: string, input: MemberInputParsed): Promise<FamilyDetail> {
  const family = await loadEditable(viewer, familyId);
  const member = await loadMemberOf(family, memberId);

  if (!member.isHead && input.relation === 'head') throw headRelationError();
  if (input.deceased && !member.deceased && (member.isHead || member.userId)) {
    throw new AppError(400, 'VALIDATION_FAILED', 'The family head, and anyone with their own sign-in, can’t be marked as passed away here. Ask your branch committee.', [
      { path: 'deceased', message: member.isHead ? 'validation.deceasedHead' : 'validation.deceasedAccount' },
    ]);
  }
  const passedAway = input.deceased && !member.deceased;
  await checkTies(family._id, input, member._id, viewer);
  const relationChanged = !member.isHead && member.relation !== input.relation;
  const oldName = member.name;

  member.name = input.name;
  member.relation = member.isHead ? 'head' : input.relation;
  member.gender = input.gender;
  member.birthYear = input.birthYear;
  member.occupation = input.occupation;
  member.education = input.education;
  // An account holder's phone is their sign-in, so it can't be changed from here.
  if (!member.userId) member.phone = input.phone;
  member.deceased = input.deceased;
  member.deathYear = input.deathYear;
  member.parentId = input.parentId ? new Types.ObjectId(input.parentId) : null;
  member.partnerId = input.partnerId ? new Types.ObjectId(input.partnerId) : null;
  member.adopted = input.adopted;
  member.otherParentId = input.otherParentId ? new Types.ObjectId(input.otherParentId) : null;
  member.formerPartner = input.formerPartner;
  member.birthFamilyId = input.birthFamilyId ? new Types.ObjectId(input.birthFamilyId) : null;
  member.maidenName = input.maidenName;
  const changes = await describeChanges(member, oldName);
  await member.save();
  // A son who is now a nephew is no longer anyone's father here.
  if (relationChanged) await untie(family._id, member._id);
  if (passedAway) {
    // No profile or sign-in invite for someone who has passed away.
    await closeForRemovedMember(member._id);
    await InviteModel.deleteOne({ memberId: member._id });
  }

  if (member.userId) await UserModel.updateOne({ _id: member.userId }, { $set: { name: member.name } });
  await syncMember(member);

  // Saving without changing anything leaves the history as it was.
  if (changes.length > 0) {
    recordHistory(family, viewer, 'updated', `Updated ${member.name}: ${changes.join(', ')}`);
    await family.save();
  }
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
  await InviteModel.deleteOne({ memberId: member._id });
  await member.deleteOne();
  await untie(family._id, member._id);
  // Nobody elsewhere has them as a parent, or a word on whether they're someone else.
  await Promise.all([
    MemberModel.updateMany({ externalParentId: member._id }, { $set: { externalParentId: null } }),
    SamePersonModel.deleteMany({ $or: [{ a: member._id }, { b: member._id }] }),
  ]);
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

