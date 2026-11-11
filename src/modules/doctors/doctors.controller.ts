import type { Request, Response } from 'express';
import {
  doctorCreateSchema,
  doctorListQuerySchema,
  doctorPatientsQuerySchema,
  doctorUpdateSchema,
  idParamSchema,
  objectIdSchema,
  patientCreateSchema,
} from '@doctor-tracker/shared';
import { z } from 'zod';
import * as doctors from './doctors.service';
import * as patients from '../patients/patients.service';

const doctorPatientParams = z.object({ id: objectIdSchema, patientId: objectIdSchema });

export async function list(req: Request, res: Response) {
  res.json(await doctors.listDoctors(doctorListQuerySchema.parse(req.query)));
}

export async function get(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  res.json({ data: await doctors.getDoctor(id) });
}

export async function create(req: Request, res: Response) {
  const input = doctorCreateSchema.parse(req.body);
  res.status(201).json({ data: await doctors.createDoctor(input) });
}

export async function update(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const input = doctorUpdateSchema.parse(req.body);
  res.json({ data: await doctors.updateDoctor(id, input) });
}

export async function listPatients(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const query = doctorPatientsQuerySchema.parse(req.query);
  await doctors.assertDoctorExists(id);
  res.json(await patients.listPatients({ ...query, doctorId: id }));
}

export async function createPatient(req: Request, res: Response) {
  const { id } = idParamSchema.parse(req.params);
  const input = patientCreateSchema.parse(req.body);
  res.status(201).json({ data: await patients.createPatient(id, input) });
}

export async function deletePatient(req: Request, res: Response) {
  const { id, patientId } = doctorPatientParams.parse(req.params);
  await patients.deletePatient(patientId, { doctorId: id });
  res.status(204).end();
}
