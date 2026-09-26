import { isGlobalRole } from '@samaj/shared';
import { Types } from 'mongoose';
import { FamilyModel } from '../models/family.model';
import type { Viewer } from './viewer';

/**
 * Who sees branch-posted content (notices, events): families in the posted
 * branch or any branch below it, so a district post reaches its towns.
 * Committee members also see everything within the branch they manage, and
 * admins see all.
 *
 * Returns a MongoDB condition on { branchId, branchAncestors } fields.
 */
export async function branchAudience(viewer: Viewer): Promise<Record<string, unknown>> {
  if (isGlobalRole(viewer.role)) return {};
  const family = await FamilyModel.findById(viewer.familyId, { branchId: 1, branchAncestors: 1 }).lean();
  const home = family ? [family.branchId, ...family.branchAncestors] : [];
  const or: Record<string, unknown>[] = [{ branchId: { $in: home } }];
  if (viewer.role === 'committee') {
    const scope = new Types.ObjectId(viewer.branchId);
    or.push({ branchId: scope }, { branchAncestors: scope });
  }
  return { $or: or };
}
