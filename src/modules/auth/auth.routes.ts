import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { loginLimiter } from '../../middleware/rateLimit';
import * as controller from './auth.controller';

export const authRouter = Router();

authRouter.post('/login', loginLimiter, controller.login);
authRouter.post('/logout', requireAuth, controller.logout);
authRouter.get('/me', requireAuth, controller.me);
