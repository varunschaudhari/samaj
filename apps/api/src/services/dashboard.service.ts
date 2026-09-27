import { type Dashboard, type DashboardBranchRow, FAMILY_STATUSES, type FamilyStatus, can, isGlobalRole } from '@samaj/shared';
import { Types } from 'mongoose';
import { type BranchDoc, BranchModel } from '../models/branch.model';
import { EventModel } from '../models/event.model';
import { FamilyModel } from '../models/family.model';
import { MemberModel } from '../models/member.model';
import { NoticeModel } from '../models/notice.model';
import { ProfileModel } from '../models/profile.model';
import { UserModel } from '../models/user.model';
import { forbidden } from '../utils/app-error';
import { cached } from '../utils/cache';
import { inBranch } from './audience';
import type { Viewer } from './viewer';

const DAY = 24 * 60 * 60 * 1000;
const WEEKS = 8;

/**
 * Every figure here is a count on an index (status or familyStatus, then
 * branchPath), so the dashboard stays quick at lakhs of families. It is
 * still cached for a minute per scope, since committee members keep it open.
 */
export async function getDashboard(viewer: Viewer): Promise<Dashboard> {
  if (!can(viewer.role, 'member:verify')) throw forbidden('The dashboard is for the branch committee and admins.');
  const scopeId = isGlobalRole(viewer.role) ? null : viewer.branchId;
  return cached(`dashboard:${scopeId ?? 'all'}`, 60_000, () => build(scopeId));
}

async function build(scopeId: string | null): Promise<Dashboard> {
  const within = scopeId ? inBranch(scopeId) : {};
  const now = new Date();

  const [scope, rowBranches] = await Promise.all([
    scopeId ? BranchModel.findById(scopeId).lean() : Promise.resolve(null),
    // One level down: districts for admins, towns for a district, the town itself for a town.
    scopeId
      ? BranchModel.find({ $or: [{ _id: new Types.ObjectId(scopeId) }, { parentId: new Types.ObjectId(scopeId) }] }).lean()
      : BranchModel.find({ parentId: null }).lean(),
  ]);

  const count = (status: FamilyStatus) => FamilyModel.countDocuments({ status, ...within });
  const [verified, pending, rejected, everyone, deceased, active, pendingProfiles, upcoming, recentNotices, submissions, branches] = await Promise.all([
    count('verified'),
    count('pending'),
    count('rejected'),
    MemberModel.countDocuments({ familyStatus: 'verified', ...within }),
    MemberModel.countDocuments({ familyStatus: 'verified', deceased: true, ...within }),
    ProfileModel.countDocuments({ status: 'active', ...within }),
    ProfileModel.countDocuments({ status: 'pending', ...within }),
    EventModel.countDocuments({ removedAt: null, startsAt: { $gte: now }, ...within }),
    NoticeModel.countDocuments({ removedAt: null, publishedAt: { $gte: new Date(now.getTime() - 30 * DAY) }, ...within }),
    weeklySubmissions(within, now),
    branchRows(scopeId, rowBranches),
  ]);

  return {
    scope: scope ? { id: String(scope._id), name: scope.name, nameMr: scope.nameMr, kind: scope.kind } : null,
    families: { verified, pending, rejected },
    // Living people: those who have passed away stay in their families, not in the count.
    members: everyone - deceased,
    matrimony: { active, pending: pendingProfiles },
    events: { upcoming },
    notices: { last30Days: recentNotices },
    submissions,
    branches,
    generatedAt: now.toISOString(),
  };
}

/** Monday of the week containing `date`, in India time, as YYYY-MM-DD. */
function weekStartIST(date: Date): string {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const back = (ist.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - back)).toISOString().slice(0, 10);
}

async function weeklySubmissions(within: Record<string, unknown>, now: Date): Promise<Dashboard['submissions']> {
  const weeks = Array.from({ length: WEEKS }, (_, i) => weekStartIST(new Date(now.getTime() - (WEEKS - 1 - i) * 7 * DAY)));
  const since = new Date(`${weeks[0]}T00:00:00+05:30`);
  const rows = await FamilyModel.aggregate<{ _id: Date; n: number }>([
    // Status is listed so the { status, [branchPath,] submittedAt } indexes apply.
    { $match: { status: { $in: [...FAMILY_STATUSES] }, ...within, submittedAt: { $gte: since } } },
    { $group: { _id: { $dateTrunc: { date: '$submittedAt', unit: 'week', startOfWeek: 'monday', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } },
  ]);
  const byWeek = new Map(rows.map((r) => [weekStartIST(r._id), r.n]));
  return weeks.map((weekStart) => ({ weekStart, count: byWeek.get(weekStart) ?? 0 }));
}

async function branchRows(scopeId: string | null, branches: BranchDoc[]): Promise<DashboardBranchRow[]> {
  // For a district, its own row counts only families placed directly in it.
  const rows = await Promise.all(
    branches.map(async (b) => {
      const isScope = String(b._id) === scopeId;
      const where = isScope && branches.length > 1 ? { branchId: b._id } : inBranch(b._id);
      const [verified, pending, rejected, committee] = await Promise.all([
        FamilyModel.countDocuments({ status: 'verified', ...where }),
        FamilyModel.countDocuments({ status: 'pending', ...where }),
        FamilyModel.countDocuments({ status: 'rejected', ...where }),
        UserModel.countDocuments({ branchId: b._id, role: 'committee' }),
      ]);
      return {
        id: String(b._id),
        name: b.name,
        nameMr: b.nameMr,
        kind: b.kind,
        families: verified + pending + rejected,
        verified,
        pending,
        committee,
        isScope,
      };
    }),
  );
  // A district's own row only when families are registered there directly.
  return rows
    .filter((r) => !r.isScope || branches.length === 1 || r.families > 0 || r.committee > 0)
    .sort((a, b) => Number(b.isScope) - Number(a.isScope) || b.families - a.families || a.name.localeCompare(b.name))
    .map(({ isScope: _isScope, ...row }) => row);
}
