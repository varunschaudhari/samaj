import { Router } from 'express';
import mongoose from 'mongoose';
import { authRouter } from './auth.routes';
import { branchRouter } from './branch.routes';
import { familyRouter, verificationRouter } from './family.routes';
import { matrimonyRouter } from './matrimony.routes';
import { memberRouter } from './member.routes';
import { committeeRouter } from './committee.routes';
import { dashboardRouter } from './dashboard.routes';
import { eventRouter } from './event.routes';
import { noticeRouter } from './notice.routes';
import { userRouter } from './user.routes';

export const apiRouter = Router();

/** Set while the process shuts down, so the load balancer stops sending traffic first. */
export const lifecycle = { draining: false };

apiRouter.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  const ok = dbUp && !lifecycle.draining;
  res.status(ok ? 200 : 503).json({ status: lifecycle.draining ? 'draining' : dbUp ? 'ok' : 'degraded', db: dbUp });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/branches', branchRouter);
apiRouter.use('/members', memberRouter);
apiRouter.use('/families', familyRouter);
apiRouter.use('/verifications', verificationRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/matrimony', matrimonyRouter);
apiRouter.use('/notices', noticeRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/committee', committeeRouter);
apiRouter.use('/dashboard', dashboardRouter);
