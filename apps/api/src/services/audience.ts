import { isGlobalRole } from '@samaj/shared';
import { Types } from 'mongoose';
import type { Viewer } from './viewer';

/** Records in this branch or any branch below it. Served by the branchPath indexes. */
export const inBranch = (branchId: string | Types.ObjectId) => ({ branchPath: new Types.ObjectId(String(branchId)) });

/**
 * Who sees branch-posted content (notices, events): families in the posted
 * branch or any branch below it, so a district post reaches its towns.
 * Committee members also see everything within the branch they manage, and
 * admins see all.
 */
export function branchAudience(viewer: Viewer): Record<string, unknown> {
  if (isGlobalRole(viewer.role)) return {};
  const home = { branchId: { $in: viewer.homePath.map((id) => new Types.ObjectId(id)) } };
  return viewer.role === 'committee' ? { $or: [home, inBranch(viewer.branchId)] } : home;
}
