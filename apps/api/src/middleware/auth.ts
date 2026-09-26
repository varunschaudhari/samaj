import { ACCESS_COOKIE } from '@samaj/shared';
import type { RequestHandler } from 'express';
import { UserModel } from '../models/user.model';
import { verifyAccessToken } from '../services/token.service';
import { AppError, unauthenticated } from '../utils/app-error';

/**
 * Requires a valid access token cookie. Loads the user on every request so a
 * role or branch change takes effect immediately rather than at token expiry.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  if (typeof token !== 'string' || !token) throw unauthenticated();

  const userId = await verifyAccessToken(token);
  if (!userId) throw new AppError(401, 'SESSION_EXPIRED', 'Your session has ended. Sign in again.');

  const user = await UserModel.findById(userId, { role: 1, branchId: 1 }).lean();
  if (!user) throw unauthenticated();

  req.user = { id: String(user._id), role: user.role, branchId: String(user.branchId) };
  next();
};
