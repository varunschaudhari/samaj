import { Router } from 'express';
import * as branches from '../controllers/branch.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const branchRouter = Router();

// Public: the signup form needs the list before anyone has an account.
branchRouter.get('/', branches.list);

// Admins only.
const manage = [requireAuth, requirePermission('branch:manage')];
branchRouter.get('/summary', ...manage, branches.summary);
branchRouter.post('/', ...manage, branches.create);
branchRouter.put('/:branchId', ...manage, branches.update);
branchRouter.delete('/:branchId', ...manage, branches.remove);
