import { Router } from 'express';
import { requireAuth, requireRole } from './middleware/auth';
import { authRouter } from './modules/auth/auth.routes';
import { doctorsRouter } from './modules/doctors/doctors.routes';
import { metaRouter } from './modules/meta/meta.routes';
import { patientsRouter } from './modules/patients/patients.routes';
import { statsRouter } from './modules/stats/stats.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Everything below requires an authenticated admin (deny by default).
const protectedRouter = Router();
protectedRouter.use(requireAuth, requireRole('admin'));
protectedRouter.use('/doctors', doctorsRouter);
protectedRouter.use('/patients', patientsRouter);
protectedRouter.use('/stats', statsRouter);
protectedRouter.use('/meta', metaRouter);

apiRouter.use(protectedRouter);
