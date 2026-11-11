import { Router } from 'express';
import * as controller from './stats.controller';

export const statsRouter = Router();

statsRouter.get('/overview', controller.overview);
statsRouter.get('/patients-per-doctor', controller.patientsPerDoctor);
statsRouter.get('/timeline', controller.timeline);
