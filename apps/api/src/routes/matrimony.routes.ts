import express, { Router } from 'express';
import * as m from '../controllers/matrimony.controller';
import { requireAuth } from '../middleware/auth';

// Access is decided per profile in the services (own family, verified viewer, committee scope).
export const matrimonyRouter = Router();
matrimonyRouter.use(requireAuth);

matrimonyRouter.get('/mine', m.mine);
matrimonyRouter.get('/search', m.search);
matrimonyRouter.get('/review', m.pending);

matrimonyRouter.post('/profiles', m.create);
matrimonyRouter.get('/profiles/:id', m.get);
matrimonyRouter.put('/profiles/:id', m.update);
matrimonyRouter.post('/profiles/:id/pause', m.pause);
matrimonyRouter.post('/profiles/:id/resume', m.resume);
matrimonyRouter.post('/profiles/:id/close', m.close);
matrimonyRouter.post('/profiles/:id/resubmit', m.resubmit);
matrimonyRouter.post('/profiles/:id/approve', m.approve);
matrimonyRouter.post('/profiles/:id/reject', m.reject);
matrimonyRouter.post('/profiles/:id/remove', m.remove);

// Raw image bytes. The limit is above the real cap so the service can return a field error instead of a bare 413.
matrimonyRouter.post('/profiles/:id/photos', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }), m.addPhoto);
matrimonyRouter.get('/profiles/:id/photos/:photoId', m.getPhoto);
matrimonyRouter.delete('/profiles/:id/photos/:photoId', m.removePhoto);
matrimonyRouter.post('/profiles/:id/photos/:photoId/main', m.makeMainPhoto);

matrimonyRouter.get('/interests', m.listInterests);
matrimonyRouter.post('/interests', m.sendInterest);
matrimonyRouter.post('/interests/:id/accept', m.accept);
matrimonyRouter.post('/interests/:id/decline', m.decline);
matrimonyRouter.post('/interests/:id/withdraw', m.withdraw);
