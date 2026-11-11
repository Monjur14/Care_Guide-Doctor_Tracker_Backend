import { z } from 'zod';
import { CONDITIONS, GENDERS, PATIENT_STATUSES } from '../constants';
import {
  dateRangeFields,
  emailSchema,
  isoDateSchema,
  objectIdSchema,
  paginationQuerySchema,
  personNameSchema,
  phoneSchema,
  refineDateRange,
} from './common';

const admissionDateSchema = isoDateSchema.refine(
  (d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000,
  'Admission date cannot be in the future',
);

const patientFields = {
  name: personNameSchema,
  age: z.coerce.number().int().min(0).max(130),
  gender: z.enum(GENDERS),
  phone: phoneSchema,
  email: emailSchema,
  condition: z.enum(CONDITIONS),
  status: z.enum(PATIENT_STATUSES),
  admissionDate: admissionDateSchema,
};

/** Body for POST /doctors/:id/patients (doctor comes from the URL). */
export const patientCreateSchema = z.strictObject(patientFields);
export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

/** Body for PATCH /patients/:id. Allows reassigning the patient to another doctor. */
export const patientUpdateSchema = z
  .strictObject({ ...patientFields, doctorId: objectIdSchema })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type PatientUpdateInput = z.infer<typeof patientUpdateSchema>;

export const PATIENT_SORT_FIELDS = ['admissionDate', 'createdAt', 'name', 'age'] as const;

export const patientListQuerySchema = paginationQuerySchema
  .extend({
    condition: z.enum(CONDITIONS).optional(),
    status: z.enum(PATIENT_STATUSES).optional(),
    gender: z.enum(GENDERS).optional(),
    doctorId: objectIdSchema.optional(),
    minAge: z.coerce.number().int().min(0).max(130).optional(),
    maxAge: z.coerce.number().int().min(0).max(130).optional(),
    sort: z.enum(PATIENT_SORT_FIELDS).default('admissionDate'),
    ...dateRangeFields,
  })
  .superRefine(refineDateRange)
  .superRefine((v, ctx) => {
    if (v.minAge !== undefined && v.maxAge !== undefined && v.minAge > v.maxAge) {
      ctx.addIssue({ code: 'custom', path: ['minAge'], message: '"minAge" must be <= "maxAge"' });
    }
  });
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

/** Query for GET /doctors/:id/patients — same filters minus doctorId. */
export const doctorPatientsQuerySchema = patientListQuerySchema;
