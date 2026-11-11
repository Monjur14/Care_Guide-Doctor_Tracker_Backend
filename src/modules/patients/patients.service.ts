import type {
  Patient as PatientDTO,
  PatientCreateInput,
  PatientListQuery,
  PatientUpdateInput,
} from '@doctor-tracker/shared';
import { Patient } from '../../models';
import { AppError } from '../../utils/AppError';
import { buildMeta, countFor, dateRangeFilter, toSkip } from '../../utils/pagination';
import { buildSearchFilter } from '../../utils/search';
import { serialize } from '../../utils/serialize';
import { assertDoctorExists } from '../doctors/doctors.service';

const PROJECTION = '-searchTokens -__v';
const DOCTOR_FIELDS = 'name specialization';

function buildFilter(q: PatientListQuery) {
  const admissionDate = dateRangeFilter(q.from, q.to);
  const age =
    q.minAge !== undefined || q.maxAge !== undefined
      ? { ...(q.minAge !== undefined && { $gte: q.minAge }), ...(q.maxAge !== undefined && { $lte: q.maxAge }) }
      : undefined;
  return {
    ...buildSearchFilter(q.search),
    ...(q.doctorId && { doctor: q.doctorId }),
    ...(q.condition && { condition: q.condition }),
    ...(q.status && { status: q.status }),
    ...(q.gender && { gender: q.gender }),
    ...(admissionDate && { admissionDate }),
    ...(age && { age }),
  };
}

export async function listPatients(q: PatientListQuery) {
  const filter = buildFilter(q);
  const dir = q.order === 'asc' ? 1 : -1;
  const sort = { [q.sort]: dir, _id: dir } as Record<string, 1 | -1>;

  const [docs, total] = await Promise.all([
    Patient.find(filter, PROJECTION)
      .sort(sort)
      .skip(toSkip(q.page, q.limit))
      .limit(q.limit)
      // One extra $in query for the whole page (not one per patient).
      .populate({ path: 'doctor', select: DOCTOR_FIELDS })
      .lean(),
    countFor(Patient, filter),
  ]);

  return { data: docs.map((d) => serialize<PatientDTO>(d)), meta: buildMeta(q.page, q.limit, total) };
}

export async function getPatient(id: string): Promise<PatientDTO> {
  const doc = await Patient.findById(id, PROJECTION).populate({ path: 'doctor', select: DOCTOR_FIELDS }).lean();
  if (!doc) throw AppError.notFound('Patient');
  return serialize<PatientDTO>(doc);
}

export async function createPatient(doctorId: string, input: PatientCreateInput): Promise<PatientDTO> {
  await assertDoctorExists(doctorId);
  const doc = await Patient.create({ ...input, doctor: doctorId });
  return getPatient(doc.id);
}

export async function updatePatient(id: string, input: PatientUpdateInput): Promise<PatientDTO> {
  const { doctorId, ...fields } = input;
  const doc = await Patient.findById(id);
  if (!doc) throw AppError.notFound('Patient');
  if (doctorId) {
    await assertDoctorExists(doctorId);
    doc.set('doctor', doctorId);
  }
  doc.set(fields);
  await doc.save(); // recomputes searchTokens
  return getPatient(id);
}

/** When `doctorId` is given, only deletes the patient if it belongs to that doctor. */
export async function deletePatient(id: string, scope: { doctorId?: string } = {}) {
  const result = await Patient.deleteOne({ _id: id, ...(scope.doctorId && { doctor: scope.doctorId }) });
  if (result.deletedCount === 0) throw AppError.notFound('Patient');
}
