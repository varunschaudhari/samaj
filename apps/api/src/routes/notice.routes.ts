import { Router } from 'express';
import * as notices from '../controllers/notice.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const noticeRouter = Router();
noticeRouter.use(requireAuth);

// Everyone signed in reads the notices for their branch, including families still being verified.
noticeRouter.get('/', notices.list);

// Posting needs notice:publish; the service also checks the branch is within the poster's reach.
const publish = requirePermission('notice:publish');
noticeRouter.post('/', publish, notices.create);
noticeRouter.put('/:id', publish, notices.update);
noticeRouter.delete('/:id', publish, notices.remove);
