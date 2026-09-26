import { BRANCH_SCOPED_ROLES, type FamilyStatus, type Permission, ROLE_RANK, type Role, can, isGlobalRole } from '@samaj/shared';
import type { Types } from 'mongoose';
import type { Viewer } from './viewer';

/*
 * Every "may this viewer do X to this record" rule lives here, so the
 * directory, family and verification services can't drift apart.
 */

interface BranchPlaced {
  branchId: Types.ObjectId | string;
  branchAncestors: (Types.ObjectId | string)[];
}

interface FamilyLike extends BranchPlaced {
  _id: Types.ObjectId | string;
  status: FamilyStatus;
}

/** The record sits in the viewer's branch or somewhere below it. */
export function inViewerBranch(viewer: Viewer, record: BranchPlaced): boolean {
  return String(record.branchId) === viewer.branchId || record.branchAncestors.some((id) => String(id) === viewer.branchId);
}

/** The role has the permission, and (for committee) the record is inside their branch. */
export function hasReach(viewer: Viewer, permission: Permission, record: BranchPlaced): boolean {
  if (!can(viewer.role, permission)) return false;
  return !BRANCH_SCOPED_ROLES.includes(viewer.role) || inViewerBranch(viewer, record);
}

export const isOwnFamily = (viewer: Viewer, family: Pick<FamilyLike, '_id'>) => String(family._id) === viewer.familyId;

/** Members of unverified families only see their own family. Committee and admins always browse. */
export function canBrowseDirectory(viewer: Viewer): boolean {
  return viewer.role !== 'member' || viewer.familyStatus === 'verified';
}

export function canViewFamily(viewer: Viewer, family: FamilyLike): boolean {
  if (isOwnFamily(viewer, family)) return true;
  if (hasReach(viewer, 'member:verify', family)) return true;
  return family.status === 'verified' && canBrowseDirectory(viewer);
}

export function canEditFamily(viewer: Viewer, family: FamilyLike): boolean {
  return isOwnFamily(viewer, family) || hasReach(viewer, 'member:write', family);
}

/** Committee members don't review their own family; an admin may. */
export function canReviewFamily(viewer: Viewer, family: FamilyLike): boolean {
  if (!hasReach(viewer, 'member:verify', family)) return false;
  return isGlobalRole(viewer.role) || !isOwnFamily(viewer, family);
}

interface ProfileLike extends BranchPlaced {
  familyId: Types.ObjectId | string;
  status: string;
}

/** The profile's own family (or its committee, via member:write) manages it. */
export function canManageProfile(viewer: Viewer, profile: ProfileLike): boolean {
  return String(profile.familyId) === viewer.familyId || hasReach(viewer, 'member:write', profile);
}

/** Committee members approve profiles in their branch, but not their own family's; admins may. */
export function canReviewProfile(viewer: Viewer, profile: ProfileLike): boolean {
  if (!hasReach(viewer, 'member:verify', profile)) return false;
  return isGlobalRole(viewer.role) || String(profile.familyId) !== viewer.familyId;
}

/** Live profiles are for verified families; the family and reviewers always see their own. */
export function canViewProfile(viewer: Viewer, profile: ProfileLike): boolean {
  if (String(profile.familyId) === viewer.familyId) return true;
  if (hasReach(viewer, 'member:verify', profile)) return true;
  return profile.status === 'active' && canBrowseDirectory(viewer);
}

/**
 * Who may create a password reset code for an account. A reset code lets you
 * sign in as that person, so it only ever works downwards: never for yourself
 * (use change password), and only for accounts below your own role. Super
 * admins may help anyone, including another super admin. Committee members are
 * also limited to their own branch.
 */
export function canResetPasswordFor(viewer: Viewer, target: { id: string; role: Role }, targetFamily: BranchPlaced): boolean {
  if (target.id === viewer.id) return false;
  if (viewer.role === 'superadmin') return true;
  if (ROLE_RANK[target.role] >= ROLE_RANK[viewer.role]) return false;
  return isGlobalRole(viewer.role) || hasReach(viewer, 'member:write', targetFamily);
}

/** Phone numbers and addresses. Your own family always; others only with read-contact in scope. */
export function canSeeContact(viewer: Viewer, record: BranchPlaced & { familyId?: Types.ObjectId | string | null }): boolean {
  if (record.familyId && String(record.familyId) === viewer.familyId) return true;
  return hasReach(viewer, 'member:read-contact', record);
}
