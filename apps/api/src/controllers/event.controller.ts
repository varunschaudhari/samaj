import { eventInputSchema, eventListQuerySchema, rsvpSchema } from '@samaj/shared';
import type { Request, Response } from 'express';
import * as events from '../services/event.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}
const id = (req: Request) => String(req.params.id ?? '');

export const list = async (req: Request, res: Response) => res.json({ items: await events.listEvents(viewer(req), eventListQuerySchema.parse(req.query)) });
export const get = async (req: Request, res: Response) => res.json({ event: await events.getEvent(viewer(req), id(req)) });

export async function create(req: Request, res: Response) {
  res.status(201).json({ event: await events.createEvent(viewer(req), eventInputSchema.parse(req.body)) });
}
export const update = async (req: Request, res: Response) => res.json({ event: await events.updateEvent(viewer(req), id(req), eventInputSchema.parse(req.body)) });

export async function remove(req: Request, res: Response) {
  await events.removeEvent(viewer(req), id(req));
  res.status(204).end();
}

export const rsvp = async (req: Request, res: Response) => res.json({ event: await events.setRsvp(viewer(req), id(req), rsvpSchema.parse(req.body).people) });
