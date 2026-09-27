import express, { Router } from 'express';
import * as families from '../controllers/family.controller';
import { requireAuth } from '../middleware/auth';

export const familyRouter = Router();
familyRouter.use(requireAuth);

// Committee members (in their branch) and admins register a family on its behalf. The service checks who may.
familyRouter.post('/', families.enrol);
familyRouter.get('/:familyId', families.get);
// Links, and people moving in or out, waiting for this family.
familyRouter.get('/:familyId/requests', families.requests);
// Households linked as parents, children and siblings, by generation.
familyRouter.get('/:familyId/tree', families.tree);
familyRouter.put('/:familyId', families.update);
familyRouter.post('/:familyId/members', families.addMember);
familyRouter.put('/:familyId/members/:memberId', families.updateMember);
familyRouter.delete('/:familyId/members/:memberId', families.removeMember);
// A one-time code so a listed person can sign in to this family with their own number.
familyRouter.post('/:familyId/members/:memberId/invite', families.createInvite);

// Raw image bytes. The limit is above the real cap so the service can return a field error instead of a bare 413.
familyRouter.put(
  '/:familyId/members/:memberId/photo',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '3mb' }),
  families.setPhoto,
);
familyRouter.delete('/:familyId/members/:memberId/photo', families.removePhoto);

familyRouter.post('/:familyId/verify', families.verify);
familyRouter.post('/:familyId/reject', families.reject);
familyRouter.post('/:familyId/resubmit', families.resubmit);

export const verificationRouter = Router();
verificationRouter.use(requireAuth);
verificationRouter.get('/', families.listPending);
verificationRouter.get('/count', families.countPending);
