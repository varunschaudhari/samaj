import { closeProfileSchema, moderationReasonSchema, profileCreateSchema, profileFieldsSchema, profileSearchSchema, sendInterestSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as interests from '../services/interest.service';
import * as matrimony from '../services/matrimony.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}
const id = (req: Request) => String(req.params.id ?? '');
const photoId = (req: Request) => String(req.params.photoId ?? '');

export const mine = async (req: Request, res: Response) => res.json(await matrimony.getMine(viewer(req)));
export const search = async (req: Request, res: Response) => res.json(await matrimony.search(viewer(req), profileSearchSchema.parse(req.query)));
export const get = async (req: Request, res: Response) => res.json({ profile: await matrimony.getProfile(viewer(req), id(req)) });

export async function create(req: Request, res: Response) {
  res.status(201).json({ profile: await matrimony.createProfile(viewer(req), profileCreateSchema.parse(req.body)) });
}
export const update = async (req: Request, res: Response) =>
  res.json({ profile: await matrimony.updateProfile(viewer(req), id(req), profileFieldsSchema.parse(req.body)) });
export const pause = async (req: Request, res: Response) => res.json({ profile: await matrimony.setPaused(viewer(req), id(req), true) });
export const resume = async (req: Request, res: Response) => res.json({ profile: await matrimony.setPaused(viewer(req), id(req), false) });
export const close = async (req: Request, res: Response) =>
  res.json({ profile: await matrimony.closeProfile(viewer(req), id(req), closeProfileSchema.parse(req.body).reason) });
export const resubmit = async (req: Request, res: Response) => res.json({ profile: await matrimony.resubmitProfile(viewer(req), id(req)) });

export const addPhoto = async (req: Request, res: Response) =>
  res.status(201).json({ profile: await matrimony.addPhoto(viewer(req), id(req), Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)) });
export const removePhoto = async (req: Request, res: Response) => res.json({ profile: await matrimony.removePhoto(viewer(req), id(req), photoId(req)) });
export const makeMainPhoto = async (req: Request, res: Response) => res.json({ profile: await matrimony.makeMainPhoto(viewer(req), id(req), photoId(req)) });
export async function getPhoto(req: Request, res: Response) {
  const { data, contentType } = await matrimony.getPhoto(viewer(req), id(req), photoId(req));
  // A photo's id never points at different bytes, so browsers may keep it.
  res.set('Cache-Control', 'private, max-age=31536000, immutable').type(contentType).send(data);
}

export const pending = async (req: Request, res: Response) => res.json({ items: await matrimony.listPendingProfiles(viewer(req)) });
export const approve = async (req: Request, res: Response) => res.json({ profile: await matrimony.approveProfile(viewer(req), id(req)) });
export const reject = async (req: Request, res: Response) =>
  res.json({ profile: await matrimony.rejectProfile(viewer(req), id(req), moderationReasonSchema.parse(req.body).reason) });
export const remove = async (req: Request, res: Response) =>
  res.json({ profile: await matrimony.removeProfile(viewer(req), id(req), moderationReasonSchema.parse(req.body).reason) });

export const listInterests = async (req: Request, res: Response) => res.json({ items: await interests.listInterests(viewer(req)) });
export async function sendInterest(req: Request, res: Response) {
  const input = sendInterestSchema.parse(req.body);
  res.status(201).json({ interest: await interests.sendInterest(viewer(req), input.fromProfileId, input.toProfileId) });
}
export const accept = async (req: Request, res: Response) => res.json({ items: await interests.respond(viewer(req), id(req), true) });
export const decline = async (req: Request, res: Response) => res.json({ items: await interests.respond(viewer(req), id(req), false) });
export const withdraw = async (req: Request, res: Response) => res.json({ items: await interests.withdraw(viewer(req), id(req)) });
