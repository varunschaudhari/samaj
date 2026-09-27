import { addGuestsSchema, createInvitationSchema, invitationInputSchema, invitationRsvpSchema } from '@samaj/shared';
import { type Request, Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as invitations from '../services/invitations.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}
const param = (req: Request, name: string) => String(req.params[name] ?? '');

/** A family's own invitations: weddings, मुंज, दशक्रिया. Sent household to household; guests answer per function. */
export const invitationRouter = Router();
invitationRouter.use(requireAuth);
invitationRouter.get('/', async (req, res) => {
  res.json(await invitations.myInvitations(viewer(req)));
});
invitationRouter.get('/audience', async (req, res) => {
  res.json({ audience: await invitations.audienceFor(viewer(req)) });
});
invitationRouter.post('/', async (req, res) => {
  res.status(201).json({ invitation: await invitations.createInvitation(viewer(req), createInvitationSchema.parse(req.body)) });
});
// Stop seeing a family's invitations, or see them again.
invitationRouter.put('/hidden/:familyId', async (req, res) => {
  await invitations.hideFamily(viewer(req), param(req, 'familyId'), true);
  res.status(204).end();
});
invitationRouter.delete('/hidden/:familyId', async (req, res) => {
  await invitations.hideFamily(viewer(req), param(req, 'familyId'), false);
  res.status(204).end();
});
invitationRouter.get('/:id', async (req, res) => {
  res.json({ invitation: await invitations.getInvitation(viewer(req), param(req, 'id')) });
});
invitationRouter.put('/:id', async (req, res) => {
  res.json({ invitation: await invitations.updateInvitation(viewer(req), param(req, 'id'), invitationInputSchema.parse(req.body)) });
});
invitationRouter.post('/:id/guests', async (req, res) => {
  res.json({ invitation: await invitations.addGuests(viewer(req), param(req, 'id'), addGuestsSchema.parse(req.body)) });
});
invitationRouter.post('/:id/cancel', async (req, res) => {
  res.json({ invitation: await invitations.cancelInvitation(viewer(req), param(req, 'id')) });
});
invitationRouter.put('/:id/rsvp', async (req, res) => {
  res.json({ invitation: await invitations.answerInvitation(viewer(req), param(req, 'id'), invitationRsvpSchema.parse(req.body)) });
});
