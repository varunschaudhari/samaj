import { type GotraList, memberListQuerySchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as memberService from '../services/member.service';
import { unauthenticated } from '../utils/app-error';

export async function list(req: Request, res: Response) {
  if (!req.user) throw unauthenticated();
  const query = memberListQuerySchema.parse(req.query);
  res.json(await memberService.listMembers(req.user, query));
}

export async function gotras(_req: Request, res: Response) {
  const body: GotraList = { items: await memberService.listGotras() };
  res.json(body);
}
