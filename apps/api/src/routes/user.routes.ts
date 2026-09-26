import { Router } from 'express';
import * as users from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';

export const userRouter = Router();
userRouter.use(requireAuth);

// The People screen: admins only.
const admin = requirePermission('user:assign-role');
userRouter.get('/', admin, users.list);
userRouter.get('/:userId', admin, users.get);
userRouter.put('/:userId/role', admin, users.updateRole);

// Committee members too, for members of their branch. The service checks who may.
userRouter.post('/:userId/reset-code', users.createResetCode);
