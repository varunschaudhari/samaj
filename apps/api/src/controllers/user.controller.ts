import { REFRESH_COOKIE, changePasswordSchema, resetPasswordSchema, roleUpdateSchema, userListQuerySchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as passwordService from '../services/password.service';
import * as userService from '../services/user.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';
import { clearAuthCookies } from '../utils/cookies';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}

const param = (req: Request, name: string) => String(req.params[name] ?? '');

export async function list(req: Request, res: Response) {
  res.json(await userService.listUsers(userListQuerySchema.parse(req.query)));
}

export async function get(req: Request, res: Response) {
  res.json({ user: await userService.getUser(viewer(req), param(req, 'userId')) });
}

export async function updateRole(req: Request, res: Response) {
  const input = roleUpdateSchema.parse(req.body);
  res.json({ user: await userService.updateRole(viewer(req), param(req, 'userId'), input) });
}

export async function createResetCode(req: Request, res: Response) {
  res.status(201).json({ reset: await passwordService.createResetCode(viewer(req), param(req, 'userId')) });
}

export async function resetPassword(req: Request, res: Response) {
  await passwordService.resetPassword(resetPasswordSchema.parse(req.body));
  // Any cookies on this device belonged to the old password.
  clearAuthCookies(res);
  res.status(204).end();
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  const refresh: unknown = req.cookies?.[REFRESH_COOKIE];
  await passwordService.changePassword(viewer(req), input, typeof refresh === 'string' ? refresh : undefined);
  res.status(204).end();
}
