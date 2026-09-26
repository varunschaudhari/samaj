import { Router } from 'express';
import * as members from '../controllers/member.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const memberRouter = Router();

memberRouter.use(requireAuth, requirePermission('directory:read'));
memberRouter.get('/', members.list);
memberRouter.get('/gotras', members.gotras);
