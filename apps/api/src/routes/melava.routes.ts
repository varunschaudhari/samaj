import { Router } from 'express';
import * as m from '../controllers/melava.controller';
import { requireAuth } from '../middleware/auth';

// Who may do what is decided in the service: verified families register, the organising committee runs it.
export const melavaRouter = Router();
melavaRouter.use(requireAuth);

melavaRouter.get('/', m.list);
melavaRouter.post('/', m.create);
melavaRouter.get('/:id', m.get);
melavaRouter.put('/:id', m.update);
melavaRouter.get('/:id/export.csv', m.exportCsv);
melavaRouter.post('/:id/registrations', m.register);
// At the office counter: find walk-in families in the organiser's branch, and register them.
melavaRouter.get('/:id/office-search', m.officeSearch);
melavaRouter.post('/:id/office-registrations', m.officeRegister);
melavaRouter.post('/:id/registrations/:registrationId/verify', m.verify);
melavaRouter.post('/:id/registrations/:registrationId/cancel', m.cancel);
