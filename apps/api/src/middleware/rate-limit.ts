import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Counts are kept in memory, which is correct for a single API instance.
// Running more than one instance needs a shared store (for example Redis).

export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests from this device. Wait a few minutes and try again.')),
});

export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Wait 15 minutes and try again.')),
});
