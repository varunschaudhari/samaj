import { addGuestsSchema, createInvitationSchema, invitationInputSchema, invitationRsvpSchema, linkReplySchema } from '@samaj/shared';
import { type Request, Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { linkReplyLimiter } from '../middleware/rate-limit';
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
// The link for people not on the app: on (a new link if it was off), off, and removing a reply.
invitationRouter.put('/:id/link', async (req, res) => {
  res.json({ invitation: await invitations.setShareLink(viewer(req), param(req, 'id'), true) });
});
invitationRouter.delete('/:id/link', async (req, res) => {
  res.json({ invitation: await invitations.setShareLink(viewer(req), param(req, 'id'), false) });
});
invitationRouter.delete('/:id/link-replies/:replyId', async (req, res) => {
  res.json({ invitation: await invitations.removeLinkReply(viewer(req), param(req, 'id'), param(req, 'replyId')) });
});

/** What anyone with an invitation's link can do, signed in or not: see the card and reply. */
export const publicInvitationRouter = Router();
publicInvitationRouter.get('/:token', async (req, res) => {
  res.json({ invitation: await invitations.publicInvitation(param(req, 'token')) });
});
publicInvitationRouter.post('/:token/reply', linkReplyLimiter, async (req, res) => {
  res.json({ reply: await invitations.replyByLink(param(req, 'token'), linkReplySchema.parse(req.body)) });
});
