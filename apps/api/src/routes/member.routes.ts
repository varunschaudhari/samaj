import { Router } from 'express';
import * as families from '../controllers/family.controller';
import * as members from '../controllers/member.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const memberRouter = Router();

memberRouter.use(requireAuth);
memberRouter.get('/', requirePermission('directory:read'), members.list);
// Access is checked per photo: the viewer must be able to see the member's family.
memberRouter.get('/:memberId/photo', families.getPhoto);
