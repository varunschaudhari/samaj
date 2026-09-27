import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { getDashboard } from '../services/dashboard.service';
import { unauthenticated } from '../utils/app-error';

export const dashboardRouter = Router();

dashboardRouter.get('/', requireAuth, requirePermission('member:verify'), async (req, res) => {
  if (!req.user) throw unauthenticated();
  res.json({ dashboard: await getDashboard(req.user) });
});
