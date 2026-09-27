import { declineSchema, linkRequestSchema, moveRequestSchema, rejectMemberSchema } from '@samaj/shared';
import { type Request, Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as approvals from '../services/approvals.service';
import * as links from '../services/links.service';
import * as moves from '../services/moves.service';
import type { Viewer } from '../services/viewer';
import { unauthenticated } from '../utils/app-error';

function viewer(req: Request): Viewer {
  if (!req.user) throw unauthenticated();
  return req.user;
}
const id = (req: Request) => String(req.params.id ?? '');

/** Links between families. The viewer's own family proposes; the other accepts. */
export const linkRouter = Router();
linkRouter.use(requireAuth);
linkRouter.post('/', async (req, res) => {
  res.status(201).json({ requests: await links.requestLink(viewer(req), linkRequestSchema.parse(req.body)) });
});
linkRouter.post('/:id/accept', async (req, res) => {
  res.json({ requests: await links.acceptLink(viewer(req), id(req)) });
});
linkRouter.delete('/:id', async (req, res) => {
  await links.removeLink(viewer(req), id(req));
  res.status(204).end();
});

/** People moving between families: the new family asks, the old one agrees, the committee approves. */
export const moveRouter = Router();
moveRouter.use(requireAuth);
moveRouter.get('/pending', async (req, res) => {
  res.json({ items: await moves.listPendingMoves(viewer(req)) });
});
moveRouter.post('/', async (req, res) => {
  res.status(201).json({ move: await moves.requestMove(viewer(req), moveRequestSchema.parse(req.body)) });
});
moveRouter.post('/:id/agree', async (req, res) => {
  res.json({ move: await moves.agreeMove(viewer(req), id(req)) });
});
moveRouter.post('/:id/approve', async (req, res) => {
  res.json({ move: await moves.approveMove(viewer(req), id(req)) });
});
moveRouter.post('/:id/decline', async (req, res) => {
  res.json({ move: await moves.declineMove(viewer(req), id(req), declineSchema.parse(req.body ?? {}).reason) });
});
moveRouter.delete('/:id', async (req, res) => {
  await moves.cancelMove(viewer(req), id(req));
  res.status(204).end();
});

/** People added to verified families, waiting for the committee. */
export const approvalRouter = Router();
approvalRouter.use(requireAuth);
approvalRouter.get('/', async (req, res) => {
  res.json({ items: await approvals.listPendingMembers(viewer(req)) });
});
approvalRouter.post('/:id/approve', async (req, res) => {
  await approvals.approveMember(viewer(req), id(req));
  res.status(204).end();
});
approvalRouter.post('/:id/reject', async (req, res) => {
  await approvals.rejectMember(viewer(req), id(req), rejectMemberSchema.parse(req.body).reason);
  res.status(204).end();
});
