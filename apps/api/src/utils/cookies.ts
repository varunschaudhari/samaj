import { ACCESS_COOKIE, REFRESH_COOKIE } from '@samaj/shared';
import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';
import type { IssuedTokens } from '../services/auth.service';
import { accessTokenMaxAgeMs, refreshTokenMaxAgeMs } from '../services/token.service';

const base = (): CookieOptions => ({ httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax' });

// The refresh cookie is only sent to /api/auth, so ordinary API calls never carry it.
const accessOptions = (): CookieOptions => ({ ...base(), path: '/api' });
const refreshOptions = (): CookieOptions => ({ ...base(), path: '/api/auth' });

export function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...accessOptions(), maxAge: accessTokenMaxAgeMs() });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, { ...refreshOptions(), maxAge: refreshTokenMaxAgeMs() });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, accessOptions());
  res.clearCookie(REFRESH_COOKIE, refreshOptions());
}
