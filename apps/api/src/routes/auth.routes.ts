import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rate-limit';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, auth.signup);
authRouter.post('/login', authLimiter, auth.login);
authRouter.post('/refresh', auth.refresh);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', requireAuth, auth.me);
authRouter.patch('/me/preferences', requireAuth, auth.updatePreferences);
