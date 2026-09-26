import { ACCESS_COOKIE } from '@samaj/shared';
import type { Request } from 'express';
import { type Options, type Store, ipKeyGenerator, rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { verifyAccessToken } from '../services/token.service';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Counts in MongoDB, so every API instance shares one count and a restart
 * doesn't reset it. One small document per key, removed by a TTL index when
 * its window ends.
 */
export class MongoStore implements Store {
  prefix: string;
  private windowMs = FIFTEEN_MINUTES;
  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private get collection() {
    return mongoose.connection.collection<{ _id: string; hits: number; resetAt: Date }>('rate_limits');
  }

  init(options: Options) {
    this.windowMs = options.windowMs;
    this.collection.createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 }).catch((err: unknown) => logger.warn({ err }, 'Rate limit index not created'));
  }

  async increment(key: string) {
    const now = new Date();
    const expired = { $or: [{ $eq: [{ $type: '$resetAt' }, 'missing'] }, { $lte: ['$resetAt', now] }] };
    // One atomic round trip: start a new window if the old one has ended, then count.
    const doc = await this.collection.findOneAndUpdate(
      { _id: this.prefix + key },
      [
        {
          $set: {
            hits: { $cond: [expired, 1, { $add: ['$hits', 1] }] },
            resetAt: { $cond: [expired, new Date(now.getTime() + this.windowMs), '$resetAt'] },
          },
        },
      ],
      { upsert: true, returnDocument: 'after' },
    );
    return { totalHits: doc?.hits ?? 1, resetTime: doc?.resetAt };
  }

  async decrement(key: string) {
    await this.collection.updateOne({ _id: this.prefix + key }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string) {
    await this.collection.deleteOne({ _id: this.prefix + key });
  }
}

// Tests and local development count in memory; a deployment counts in MongoDB.
const store = (prefix: string) => (env.NODE_ENV === 'production' ? new MongoStore(prefix) : undefined);
const ipKey = (req: Request) => ipKeyGenerator(req.ip ?? '');

/**
 * All API traffic. Signed-in people are counted per account, not per IP:
 * mobile networks put thousands of phones behind one carrier IP, and counting
 * those together would lock out a whole town. Only anonymous traffic is per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: async (req) => ((await accountOf(req)) ? env.RATE_LIMIT_MAX : env.ANON_RATE_LIMIT_MAX),
  keyGenerator: async (req) => {
    const account = await accountOf(req);
    return account ? `u:${account}` : `ip:${ipKey(req)}`;
  },
  // Health checks come from the load balancer; photos are cached and already signed-in.
  skip: (req) => req.path === '/health' || (req.method === 'GET' && req.path.endsWith('/photo')),
  store: store('api:'),
  passOnStoreError: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests from this device. Wait a few minutes and try again.')),
});

/** The signed-in account on this request, if its access cookie is valid. Remembered per request. */
async function accountOf(req: Request): Promise<string | null> {
  const cached = (req as Request & { rateLimitAccount?: string | null }).rateLimitAccount;
  if (cached !== undefined) return cached;
  const token: unknown = req.cookies?.[ACCESS_COOKIE];
  const account = typeof token === 'string' && token ? await verifyAccessToken(token) : null;
  (req as Request & { rateLimitAccount?: string | null }).rateLimitAccount = account;
  return account;
}

/**
 * Password guessing: attempts per mobile number (or per account, for change
 * password), from any IP, so one account can't be guessed at and a busy
 * carrier IP doesn't block everyone behind it.
 */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: env.AUTH_RATE_LIMIT_MAX,
  keyGenerator: (req) => {
    if (req.user) return `user:${req.user.id}`;
    const body = req.body as { phone?: unknown } | undefined;
    const phone = typeof body?.phone === 'string' ? body.phone.replace(/\D/g, '').slice(-10) : '';
    return phone ? `phone:${phone}` : `ip:${ipKey(req)}`;
  },
  store: store('auth:'),
  passOnStoreError: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Wait 15 minutes and try again.')),
});

/** A looser per-IP cap on sign-in routes, against one machine trying many numbers. */
export const authIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: env.AUTH_IP_RATE_LIMIT_MAX,
  keyGenerator: ipKey,
  store: store('auth-ip:'),
  passOnStoreError: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError(429, 'RATE_LIMITED', 'Too many sign-in attempts from this network. Wait 15 minutes and try again.')),
});
