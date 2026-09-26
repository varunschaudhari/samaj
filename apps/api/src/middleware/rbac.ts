import { type Permission, can } from '@samaj/shared';
import type { RequestHandler } from 'express';
import { forbidden, unauthenticated } from '../utils/app-error';

/**
 * Checks the role has the permission at all. Branch scope (a committee member
 * acting only on their own branch) is checked in the service, where the
 * record's branch is known.
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthenticated();
    if (!can(req.user.role, permission)) throw forbidden();
    next();
  };
}
