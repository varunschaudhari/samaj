import { type AdminUser, type AdminUserDetail, type AdminUserPage, PROTECTED_ROLES, type Role, type RoleUpdateInput, type assignCommitteeSchema, can, type userListQuerySchema } from '@samaj/shared';
import { type QueryFilter, Types } from 'mongoose';
import type { z } from 'zod';
import { BranchModel } from '../models/branch.model';
import { FamilyModel } from '../models/family.model';
import { OfficeBearerModel } from '../models/office-bearer.model';
import { RoleChangeModel } from '../models/role-change.model';
import { type UserDoc, UserModel } from '../models/user.model';
import { AppError, forbidden, notFound } from '../utils/app-error';
import { escapeRegex } from '../utils/regex';
import { canResetPasswordFor } from './access';
import { addBearer } from './committee.service';
import type { Viewer } from './viewer';

type ListQuery = z.output<typeof userListQuerySchema>;

const userGone = () => notFound('That account no longer exists.');

async function toAdminUsers(users: Pick<UserDoc, '_id' | 'name' | 'phone' | 'role' | 'branchId' | 'familyId' | 'createdAt'>[]): Promise<AdminUser[]> {
  const [branches, families] = await Promise.all([
    BranchModel.find({ _id: { $in: users.map((u) => u.branchId) } }).lean(),
    FamilyModel.find({ _id: { $in: users.map((u) => u.familyId) } }, { status: 1 }).lean(),
  ]);
  const branchBy = new Map(branches.map((b) => [String(b._id), b]));
  const statusBy = new Map(families.map((f) => [String(f._id), f.status]));
  return users.map((u) => {
    const branch = branchBy.get(String(u.branchId));
    return {
      id: String(u._id),
      name: u.name,
      phone: u.phone,
      role: u.role,
      branch: { id: String(u.branchId), name: branch?.name ?? '', nameMr: branch?.nameMr ?? '' },
      familyId: String(u.familyId),
      familyStatus: statusBy.get(String(u.familyId)) ?? 'pending',
      createdAt: (u.createdAt ?? new Date()).toISOString(),
    };
  });
}

function encodeCursor(u: Pick<UserDoc, 'name' | '_id'>): string {
  return Buffer.from(JSON.stringify([u.name, String(u._id)])).toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: Types.ObjectId } {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && typeof parsed[1] === 'string' && Types.ObjectId.isValid(parsed[1])) {
      return { name: parsed[0], id: new Types.ObjectId(parsed[1]) };
    }
  } catch {
    // fall through
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'The page link is invalid. Reload the list.');
}

/** Accounts for the admin People screen: search by name or mobile number, filter by role. */
export async function listUsers(query: ListQuery): Promise<AdminUserPage> {
  const conditions: QueryFilter<UserDoc>[] = [];
  if (query.role) conditions.push({ role: query.role });
  if (query.q) {
    const digits = query.q.replace(/\D/g, '');
    const rx = new RegExp(`(^|\\s)${escapeRegex(query.q)}`, 'i');
    conditions.push({ $or: [{ name: rx }, ...(digits.length >= 3 ? [{ phone: new RegExp(escapeRegex(digits)) }] : [])] });
  }
  const base: QueryFilter<UserDoc> = conditions.length ? { $and: conditions } : {};
  const page: QueryFilter<UserDoc> = { $and: [...conditions] };
  if (query.cursor) {
    const after = decodeCursor(query.cursor);
    page.$and?.push({ $or: [{ name: { $gt: after.name } }, { name: after.name, _id: { $gt: after.id } }] });
  }
  if (page.$and?.length === 0) delete page.$and;

  const [docs, total] = await Promise.all([
    UserModel.find(page).sort({ name: 1, _id: 1 }).limit(query.limit + 1).lean(),
    UserModel.countDocuments(base),
  ]);
  const hasMore = docs.length > query.limit;
  const users = hasMore ? docs.slice(0, query.limit) : docs;
  const last = users.at(-1);
  return { items: await toAdminUsers(users), total, nextCursor: hasMore && last ? encodeCursor(last) : null };
}

async function loadUser(id: string) {
  if (!Types.ObjectId.isValid(id)) throw userGone();
  const user = await UserModel.findById(id);
  if (!user) throw userGone();
  return user;
}

export async function getUser(viewer: Viewer, id: string): Promise<AdminUserDetail> {
  const user = await loadUser(id);
  const [[summary], changes, family] = await Promise.all([
    toAdminUsers([user]),
    RoleChangeModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20).lean(),
    FamilyModel.findById(user.familyId, { branchId: 1, branchAncestors: 1 }).lean(),
  ]);
  if (!summary) throw userGone();

  const branchIds = changes.flatMap((c) => [c.fromBranchId, c.toBranchId]).filter((b): b is Types.ObjectId => Boolean(b));
  const branchNames = new Map((await BranchModel.find({ _id: { $in: branchIds } }, { name: 1 }).lean()).map((b) => [String(b._id), b.name]));
  const nameOf = (b: Types.ObjectId | null | undefined) => (b ? (branchNames.get(String(b)) ?? null) : null);

  return {
    ...summary,
    roleHistory: changes.map((c) => ({
      at: (c.createdAt ?? new Date()).toISOString(),
      byName: c.byName,
      fromRole: c.fromRole,
      toRole: c.toRole,
      fromBranch: nameOf(c.fromBranchId),
      toBranch: nameOf(c.toBranchId),
    })),
    permissions: {
      canChangeRole: user.id !== viewer.id && mayChangeRole(viewer, user.role),
      canResetPassword: family ? canResetPasswordFor(viewer, { id: user.id, role: user.role }, family) : false,
    },
  };
}

/** Admins manage members and committee; only a super admin may change an admin's or super admin's role. */
function mayChangeRole(viewer: Viewer, targetRole: Role): boolean {
  return !PROTECTED_ROLES.includes(targetRole) || can(viewer.role, 'user:assign-admin');
}

/**
 * Change someone's role and the branch it applies to. Takes effect on their
 * next request (requireAuth reloads the user every time).
 */
export async function updateRole(viewer: Viewer, id: string, input: RoleUpdateInput): Promise<AdminUserDetail> {
  const user = await loadUser(id);
  if (user.id === viewer.id) throw forbidden("You can't change your own role. Ask another admin.");
  if (!mayChangeRole(viewer, user.role) || !mayChangeRole(viewer, input.role)) {
    throw new AppError(403, 'FORBIDDEN', 'Only a super admin can appoint or remove admins.', [{ path: 'role', message: 'validation.roleProtected' }]);
  }

  const branch = await BranchModel.findById(input.branchId).lean();
  if (!branch) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Pick a branch from the list.', [{ path: 'branchId', message: 'validation.branchRequired' }]);
  }
  // Normally unreachable (the only super admin can't change their own role), but
  // two super admins demoting each other at the same moment must not leave none.
  if (user.role === 'superadmin' && input.role !== 'superadmin' && (await UserModel.countDocuments({ role: 'superadmin' })) <= 1) {
    throw new AppError(409, 'CONFLICT', 'This is the only super admin. Make someone else a super admin first.');
  }

  const changed = user.role !== input.role || String(user.branchId) !== input.branchId;
  if (changed) {
    await RoleChangeModel.create({
      userId: user._id,
      byUserId: new Types.ObjectId(viewer.id),
      byName: viewer.name,
      fromRole: user.role,
      toRole: input.role,
      fromBranchId: user.branchId,
      toBranchId: branch._id,
    });
    user.role = input.role;
    user.branchId = branch._id;
    await user.save();
  }
  return getUser(viewer, id);
}

/**
 * Make someone a committee member for a branch (from the Branches screen), and
 * optionally list them on that branch's Committee page. Goes through updateRole,
 * so the change is recorded and the usual protections apply.
 */
export async function assignCommittee(viewer: Viewer, branchId: string, input: z.output<typeof assignCommitteeSchema>): Promise<AdminUserDetail> {
  if (!Types.ObjectId.isValid(branchId) || !(await BranchModel.exists({ _id: branchId }))) throw notFound('That branch no longer exists.');
  const user = await loadUser(input.userId);
  // Admins already act in every branch; making one "committee" would quietly demote them.
  if (PROTECTED_ROLES.includes(user.role)) {
    throw new AppError(409, 'CONFLICT', 'This person is an admin, so they already work in every branch.', [{ path: 'userId', message: 'validation.alreadyAdmin' }]);
  }

  const detail = await updateRole(viewer, input.userId, { role: 'committee', branchId });

  if (input.listAs && !(await OfficeBearerModel.exists({ branchId, phone: user.phone }))) {
    await addBearer(viewer, { branchId, post: input.listAs, name: user.name, phone: user.phone });
  }
  return detail;
}

/**
 * Take someone off a branch's committee: they become a member again, back in
 * their own family's branch, and leave that branch's Committee page.
 */
export async function removeCommittee(viewer: Viewer, branchId: string, userId: string): Promise<AdminUserDetail> {
  const user = await loadUser(userId);
  if (user.role !== 'committee' || String(user.branchId) !== branchId) throw notFound('This person is not on that committee.');
  const family = await FamilyModel.findById(user.familyId, { branchId: 1 }).lean();
  const home = family ? String(family.branchId) : branchId;

  const detail = await updateRole(viewer, userId, { role: 'member', branchId: home });
  await OfficeBearerModel.deleteMany({ branchId, phone: user.phone });
  return detail;
}
