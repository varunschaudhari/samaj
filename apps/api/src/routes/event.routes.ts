import { Router } from 'express';
import * as events from '../controllers/event.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const eventRouter = Router();
eventRouter.use(requireAuth);

eventRouter.get('/', events.list);
eventRouter.get('/:id', events.get);
// Any family that can see the event can answer for itself.
eventRouter.put('/:id/rsvp', events.rsvp);

// Organising: the same people who post notices, within their branch.
const organise = requirePermission('notice:publish');
eventRouter.post('/', organise, events.create);
eventRouter.put('/:id', organise, events.update);
eventRouter.delete('/:id', organise, events.remove);
