import { z } from 'zod';
import { SPECIALIZATIONS } from '../constants';
import {
  dateRangeFields,
  emailSchema,
  paginationQuerySchema,
  personNameSchema,
  phoneSchema,
  refineDateRange,
} from './common';

export const doctorCreateSchema = z.strictObject({
  name: personNameSchema,
  specialization: z.enum(SPECIALIZATIONS),
  hospital: z.string().trim().min(2).max(150),
  phone: phoneSchema,
  email: emailSchema,
});
export type DoctorCreateInput = z.infer<typeof doctorCreateSchema>;

export const doctorUpdateSchema = doctorCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type DoctorUpdateInput = z.infer<typeof doctorUpdateSchema>;

export const DOCTOR_SORT_FIELDS = ['createdAt', 'name'] as const;

export const doctorListQuerySchema = paginationQuerySchema
  .extend({
    specialization: z.enum(SPECIALIZATIONS).optional(),
    hospital: z.string().trim().max(150).optional(),
    sort: z.enum(DOCTOR_SORT_FIELDS).default('createdAt'),
    ...dateRangeFields,
  })
  .superRefine(refineDateRange);
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;
