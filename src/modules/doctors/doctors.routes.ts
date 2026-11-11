import { Router } from 'express';
import * as controller from './doctors.controller';

export const doctorsRouter = Router();

doctorsRouter.get('/', controller.list);
doctorsRouter.post('/', controller.create);
doctorsRouter.get('/:id', controller.get);
doctorsRouter.patch('/:id', controller.update);
doctorsRouter.get('/:id/patients', controller.listPatients);
doctorsRouter.post('/:id/patients', controller.createPatient);
doctorsRouter.delete('/:id/patients/:patientId', controller.deletePatient);
