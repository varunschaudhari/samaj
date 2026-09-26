import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import * as users from '../controllers/user.controller';
import { requireAuth } from '../middleware/auth';
import { authIpLimiter, authLimiter } from '../middleware/rate-limit';

export const authRouter = Router();

authRouter.use(['/signup', '/join', '/login', '/reset-password'], authIpLimiter);
authRouter.post('/signup', authLimiter, auth.signup);
authRouter.post('/join', authLimiter, auth.join);
authRouter.post('/login', authLimiter, auth.login);
authRouter.post('/refresh', auth.refresh);
// Public, like login: rate limited the same way.
authRouter.post('/reset-password', authLimiter, users.resetPassword);
authRouter.post('/change-password', requireAuth, authLimiter, users.changePassword);
authRouter.post('/logout', auth.logout);
authRouter.get('/me', requireAuth, auth.me);
authRouter.patch('/me/preferences', requireAuth, auth.updatePreferences);
