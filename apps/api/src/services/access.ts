import { BRANCH_SCOPED_ROLES, type FamilyStatus, type Permission, can } from '@samaj/shared';
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
  return viewer.role === 'admin' || !isOwnFamily(viewer, family);
}

/** Phone numbers and addresses. Your own family always; others only with read-contact in scope. */
export function canSeeContact(viewer: Viewer, record: BranchPlaced & { familyId?: Types.ObjectId | string | null }): boolean {
  if (record.familyId && String(record.familyId) === viewer.familyId) return true;
  return hasReach(viewer, 'member:read-contact', record);
}
