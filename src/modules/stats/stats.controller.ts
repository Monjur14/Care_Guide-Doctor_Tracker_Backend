import type { Request, Response } from 'express';
import { patientsPerDoctorQuerySchema, timelineQuerySchema } from '@doctor-tracker/shared';
import * as stats from './stats.service';

export async function overview(_req: Request, res: Response) {
  res.json({ data: await stats.overview() });
}

export async function patientsPerDoctor(req: Request, res: Response) {
  const { limit } = patientsPerDoctorQuerySchema.parse(req.query);
  res.json({ data: await stats.patientsPerDoctor(limit) });
}

export async function timeline(req: Request, res: Response) {
  res.json({ data: await stats.timeline(timelineQuerySchema.parse(req.query)) });
}
