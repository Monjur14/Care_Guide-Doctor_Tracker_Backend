/**
 * Response shapes for the OpenAPI document. They are strict, and the contract
 * tests (tests/docs.test.ts) parse real API responses with them, so the docs
 * fail CI if they drift from what the API actually returns.
 */
import { z } from 'zod';
import { CONDITIONS, GENDERS, PATIENT_STATUSES, SPECIALIZATIONS, USER_ROLES } from '@doctor-tracker/shared';

const id = z.string().regex(/^[a-f\d]{24}$/).meta({ example: '6af330101aa8649de4127232' });
const timestamp = z.iso.datetime().meta({ example: '2026-11-10T12:25:44.626Z' });

export const errorBody = z
  .strictObject({
    error: z.strictObject({
      code: z.string().meta({ example: 'VALIDATION_ERROR' }),
      message: z.string().meta({ example: 'Validation failed' }),
      details: z
        .array(z.strictObject({ path: z.string(), message: z.string() }))
        .optional()
        .meta({ example: [{ path: 'email', message: 'Invalid email' }] }),
      requestId: z.string().meta({ example: '1e9e666b-4154-4704-8034-895d849d15fb' }),
    }),
  })
  .meta({ id: 'Error' });

export const paginationMeta = z
  .strictObject({
    page: z.int().min(1).meta({ example: 1 }),
    limit: z.int().min(1).meta({ example: 10 }),
    total: z.int().min(0).meta({ example: 800 }),
    totalPages: z.int().min(1).meta({ example: 80 }),
  })
  .meta({ id: 'PaginationMeta' });

export const authUser = z
  .strictObject({
    id,
    email: z.email().meta({ example: 'admin@doctortracker.dev' }),
    role: z.enum(USER_ROLES),
  })
  .meta({ id: 'AuthUser' });

export const doctorSummary = z
  .strictObject({
    id,
    name: z.string().meta({ example: 'Dr. Ayesha Rahman' }),
    specialization: z.enum(SPECIALIZATIONS),
  })
  .meta({ id: 'DoctorSummary' });

export const doctor = z
  .strictObject({
    id,
    name: z.string().meta({ example: 'Dr. Ayesha Rahman' }),
    specialization: z.enum(SPECIALIZATIONS),
    hospital: z.string().meta({ example: 'Square Hospital' }),
    phone: z.string().meta({ example: '+880 1711 123456' }),
    email: z.email().meta({ example: 'ayesha.rahman@squarehospital.dev' }),
    patientCount: z.int().min(0).meta({ example: 27 }),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: 'Doctor' });

export const patient = z
  .strictObject({
    id,
    name: z.string().meta({ example: 'Karim Hossain' }),
    age: z.int().min(0).max(130).meta({ example: 45 }),
    gender: z.enum(GENDERS),
    phone: z.string().meta({ example: '+880 1811 654321' }),
    email: z.email().meta({ example: 'karim@mail.dev' }),
    condition: z.enum(CONDITIONS),
    status: z.enum(PATIENT_STATUSES),
    admissionDate: timestamp,
    doctor: doctorSummary.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .meta({ id: 'Patient' });

const count = z.int().min(0);

export const statsOverview = z
  .strictObject({
    totalDoctors: count.meta({ example: 40 }),
    totalPatients: count.meta({ example: 800 }),
    patientsByStatus: z.strictObject({
      admitted: count.meta({ example: 142 }),
      under_treatment: count.meta({ example: 271 }),
      discharged: count.meta({ example: 387 }),
    }),
    patientsByCondition: z
      .array(z.strictObject({ condition: z.enum(CONDITIONS), count }))
      .meta({ description: 'Conditions with at least one patient, most common first' }),
    admissionsLast30Days: count.meta({ example: 320 }),
    newDoctorsLast30Days: count.meta({ example: 6 }),
  })
  .meta({ id: 'StatsOverview' });

export const patientsPerDoctorItem = z
  .strictObject({ doctor: doctorSummary, count: count.meta({ example: 48 }) })
  .meta({ id: 'PatientsPerDoctorItem' });

export const timelinePoint = z
  .strictObject({
    bucket: z.string().meta({ description: 'YYYY-MM-DD (day) or YYYY-MM (month), in the requested time zone', example: '2026-11-01' }),
    total: count,
    admitted: count,
    under_treatment: count,
    discharged: count,
  })
  .meta({ id: 'TimelinePoint' });

export const filterOptions = z
  .strictObject({
    specializations: z.array(z.enum(SPECIALIZATIONS)),
    conditions: z.array(z.enum(CONDITIONS)),
    statuses: z.array(z.enum(PATIENT_STATUSES)),
    genders: z.array(z.enum(GENDERS)),
    hospitals: z.array(z.string()).meta({ example: ['Square Hospital', 'United Hospital'] }),
  })
  .meta({ id: 'FilterOptions' });

export const health = z.strictObject({ status: z.literal('ok') }).meta({ id: 'Health' });

/** `{ data: T }` envelope */
export const dataOf = <T extends z.ZodType>(schema: T) => z.strictObject({ data: schema });
/** `{ data: T[], meta }` envelope */
export const listOf = <T extends z.ZodType>(schema: T) => z.strictObject({ data: z.array(schema), meta: paginationMeta });
