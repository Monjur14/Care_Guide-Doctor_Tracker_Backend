import { Types } from 'mongoose';
import type {
  Doctor as DoctorDTO,
  DoctorCreateInput,
  DoctorListQuery,
  DoctorUpdateInput,
} from '@doctor-tracker/shared';
import { Doctor, Patient } from '../../models';
import { AppError } from '../../utils/AppError';
import { buildMeta, countFor, dateRangeFilter, toSkip } from '../../utils/pagination';
import { buildSearchFilter } from '../../utils/search';
import { serialize } from '../../utils/serialize';

const PROJECTION = '-searchTokens -__v';

function buildFilter(q: DoctorListQuery) {
  const createdAt = dateRangeFilter(q.from, q.to);
  return {
    ...buildSearchFilter(q.search),
    ...(q.specialization && { specialization: q.specialization }),
    ...(q.hospital && { hospital: q.hospital }),
    ...(createdAt && { createdAt }),
  };
}

/** Patient counts for one page of doctors: a single $group over the { doctor } index. */
async function patientCounts(ids: Types.ObjectId[]) {
  if (ids.length === 0) return new Map<string, number>();
  const rows = await Patient.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { doctor: { $in: ids } } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export async function listDoctors(q: DoctorListQuery) {
  const filter = buildFilter(q);
  const dir: 1 | -1 = q.order === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [q.sort]: dir, _id: dir };

  const [docs, total] = await Promise.all([
    Doctor.find(filter, PROJECTION).sort(sort).skip(toSkip(q.page, q.limit)).limit(q.limit).lean(),
    countFor(Doctor, filter),
  ]);

  const counts = await patientCounts(docs.map((d) => d._id));
  const data = docs.map((d) => ({
    ...serialize<DoctorDTO>(d),
    patientCount: counts.get(String(d._id)) ?? 0,
  }));
  return { data, meta: buildMeta(q.page, q.limit, total) };
}

export async function getDoctor(id: string): Promise<DoctorDTO> {
  const [doc, patientCount] = await Promise.all([
    Doctor.findById(id, PROJECTION).lean(),
    Patient.countDocuments({ doctor: id }),
  ]);
  if (!doc) throw AppError.notFound('Doctor');
  return { ...serialize<DoctorDTO>(doc), patientCount };
}

export async function createDoctor(input: DoctorCreateInput): Promise<DoctorDTO> {
  const doc = await Doctor.create(input);
  return { ...serialize<DoctorDTO>(doc.toObject()), patientCount: 0 };
}

export async function updateDoctor(id: string, input: DoctorUpdateInput): Promise<DoctorDTO> {
  const doc = await Doctor.findById(id);
  if (!doc) throw AppError.notFound('Doctor');
  doc.set(input);
  await doc.save(); // save() (not findOneAndUpdate) so searchTokens are recomputed
  return getDoctor(id);
}

export async function assertDoctorExists(id: string) {
  if (!(await Doctor.exists({ _id: id }))) throw AppError.notFound('Doctor');
}
