import type { BranchKind } from './branch';

/** One branch's figures on the dashboard: one level below the viewer's scope. */
export interface DashboardBranchRow {
  id: string;
  name: string;
  nameMr: string;
  kind: BranchKind;
  families: number;
  verified: number;
  pending: number;
  /** Accounts with the committee role for this branch. */
  committee: number;
}

/**
 * The committee and admin dashboard. A committee member sees their branch and
 * everything under it; admins see every branch (scope is null).
 */
export interface Dashboard {
  scope: { id: string; name: string; nameMr: string; kind: BranchKind } | null;
  families: { verified: number; pending: number; rejected: number };
  /** People in verified families. */
  members: number;
  matrimony: { active: number; pending: number };
  events: { upcoming: number };
  notices: { last30Days: number };
  /** Families that entered the review queue, per week (Monday, India time), oldest first. */
  submissions: { weekStart: string; count: number }[];
  branches: DashboardBranchRow[];
  generatedAt: string;
}
