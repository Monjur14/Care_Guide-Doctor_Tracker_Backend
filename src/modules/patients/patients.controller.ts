import type { Request, Response } from 'express';
import { idParamSchema, patientListQuerySchema, patientUpdateSchema } from '@doctor-tracker/shared';
import * as patients from './patients.service';

export async function list(req: Request, res: Response) {
  res.json(await patients.listPatients(patientListQuerySchema.parse(req.query)));
}

export async function get(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  res.json({ data: await patients.getPatient(id) });
}

export async function update(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const input = patientUpdateSchema.parse(req.body);
  res.json({ data: await patients.updatePatient(id, input) });
}

export async function remove(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  await patients.deletePatient(id);
  res.status(204).end();
}
