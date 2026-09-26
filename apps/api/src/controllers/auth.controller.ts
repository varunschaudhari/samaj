import { REFRESH_COOKIE, joinSchema, loginSchema, signupSchema, updatePreferencesSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { unauthenticated } from '../utils/app-error';
import { clearAuthCookies, setAuthCookies } from '../utils/cookies';

const refreshCookie = (req: Request): string | undefined => {
  const value: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' ? value : undefined;
};

const meta = (req: Request) => ({ userAgent: req.get('user-agent') });

export async function signup(req: Request, res: Response) {
  const input = signupSchema.parse(req.body);
  const { user, tokens } = await authService.signup(input, meta(req));
  setAuthCookies(res, tokens);
  res.status(201).json({ user });
}

export async function join(req: Request, res: Response) {
  const input = joinSchema.parse(req.body);
  const { user, tokens } = await authService.join(input, meta(req));
  setAuthCookies(res, tokens);
  res.status(201).json({ user });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { user, tokens } = await authService.login(input, meta(req));
  setAuthCookies(res, tokens);
  res.json({ user });
}

export async function refresh(req: Request, res: Response) {
  try {
    const { user, tokens } = await authService.refresh(refreshCookie(req));
    setAuthCookies(res, tokens);
    res.json({ user });
  } catch (err) {
    // A dead refresh token is useless to keep; clear both cookies.
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(refreshCookie(req));
  clearAuthCookies(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  if (!req.user) throw unauthenticated();
  res.json({ user: await authService.getMe(req.user.id) });
}

export async function updatePreferences(req: Request, res: Response) {
  if (!req.user) throw unauthenticated();
  const input = updatePreferencesSchema.parse(req.body);
  res.json({ user: await authService.updatePreferences(req.user.id, input) });
}
