import { Router } from 'express';
import * as committee from '../controllers/committee.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const committeeRouter = Router();
committeeRouter.use(requireAuth);

// Everyone signed in, including families still being verified: that's when they need to call someone.
committeeRouter.get('/', committee.list);

const manage = requirePermission('notice:publish');
committeeRouter.post('/', manage, committee.add);
committeeRouter.put('/:id', manage, committee.update);
committeeRouter.delete('/:id', manage, committee.remove);
