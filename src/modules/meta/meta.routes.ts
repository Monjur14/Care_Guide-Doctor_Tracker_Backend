import { Router } from 'express';
import { CONDITIONS, GENDERS, PATIENT_STATUSES, SPECIALIZATIONS, type FilterOptions } from '@doctor-tracker/shared';
import { Doctor } from '../../models';

export const metaRouter = Router();

/** Options for filter dropdowns. `distinct` on an indexed field is an index-only scan. */
metaRouter.get('/filters', async (_req, res) => {
  const hospitals = (await Doctor.distinct('hospital')).sort((a, b) => a.localeCompare(b));
  const data: FilterOptions = {
    specializations: SPECIALIZATIONS,
    conditions: CONDITIONS,
    statuses: PATIENT_STATUSES,
    genders: GENDERS,
    hospitals,
  };
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.json({ data });
});
