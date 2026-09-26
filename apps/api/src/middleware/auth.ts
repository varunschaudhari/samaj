import { ACCESS_COOKIE } from '@samaj/shared';
import type { RequestHandler } from 'express';
import { FamilyModel } from '../models/family.model';
import { UserModel } from '../models/user.model';
import { verifyAccessToken } from '../services/token.service';
import { AppError, unauthenticated } from '../utils/app-error';

/**
 * Requires a valid access token cookie. Loads the user and their family's
 * status on every request, so a role change or a verification takes effect
 * immediately rather than when the token expires.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string' || !token) throw unauthenticated();

  const userId = await verifyAccessToken(token);
  if (!userId) throw new AppError(401, 'SESSION_EXPIRED', 'Your session has ended. Sign in again.');

  const user = await UserModel.findById(userId, { name: 1, role: 1, branchId: 1, familyId: 1 }).lean();
  if (!user) throw unauthenticated();
  const family = await FamilyModel.findById(user.familyId, { status: 1, branchId: 1, branchAncestors: 1 }).lean();

  req.user = {
    id: String(user._id),
    name: user.name,
    role: user.role,
    branchId: String(user.branchId),
    familyId: String(user.familyId),
    familyStatus: family?.status ?? 'pending',
    homePath: family ? [family.branchId, ...family.branchAncestors].map(String) : [],
  };
  next();
};
