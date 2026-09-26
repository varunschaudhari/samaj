import type { Role } from '@samaj/shared';

/** The signed-in user as services see them. Set on req.user by requireAuth. */
export interface Viewer {
  id: string;
  role: Role;
  branchId: string;
}
