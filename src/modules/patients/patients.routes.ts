import { Router } from 'express';
import * as controller from './patients.controller';

export const patientsRouter = Router();

patientsRouter.get('/', controller.list);
patientsRouter.get('/:id', controller.get);
patientsRouter.patch('/:id', controller.update);
patientsRouter.delete('/:id', controller.remove);
