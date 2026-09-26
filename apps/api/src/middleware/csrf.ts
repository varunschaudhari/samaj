import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@samaj/shared';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Auth lives in cookies, so a hostile site could submit a form that carries
 * them. Browsers only let another origin set a custom header after a CORS
 * preflight, which our CORS policy refuses. Requiring the header on every
 * state-changing request therefore blocks cross-site forgery.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) return next();
  throw new AppError(403, 'CSRF_REJECTED', 'This request came from outside the Samaj app, so it was blocked.');
};
