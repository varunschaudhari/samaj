import { Router } from 'express';
import mongoose from 'mongoose';
import { authRouter } from './auth.routes';
import { branchRouter } from './branch.routes';
import { familyRouter, verificationRouter } from './family.routes';
import { memberRouter } from './member.routes';
import { userRouter } from './user.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/branches', branchRouter);
apiRouter.use('/members', memberRouter);
apiRouter.use('/families', familyRouter);
apiRouter.use('/verifications', verificationRouter);
apiRouter.use('/users', userRouter);
