import type { FamilyStatus, Role } from '@samaj/shared';

/** The signed-in user as services see them. Set on req.user by requireAuth. */
export interface Viewer {
  id: string;
  name: string;
  role: Role;
  branchId: string;
  familyId: string;
  familyStatus: FamilyStatus;
  /** The family's branch and every branch above it: whose notices, events and committees they see. */
  homePath: string[];
}
