import { officeBearerInputSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as committee from '../services/committee.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}
const id = (req: Request) => String(req.params.id ?? '');

export const list = async (req: Request, res: Response) => res.json({ groups: await committee.listCommittees(viewer(req)) });

export async function add(req: Request, res: Response) {
  res.status(201).json({ bearer: await committee.addBearer(viewer(req), officeBearerInputSchema.parse(req.body)) });
}

export const update = async (req: Request, res: Response) =>
  res.json({ bearer: await committee.updateBearer(viewer(req), id(req), officeBearerInputSchema.parse(req.body)) });

export async function remove(req: Request, res: Response) {
  await committee.removeBearer(viewer(req), id(req));
  res.status(204).end();
}
