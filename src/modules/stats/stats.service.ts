import type { Types } from 'mongoose';
import {
  CONDITIONS,
  PATIENT_STATUSES,
  type PatientsPerDoctorItem,
  type StatsOverview,
  type TimelinePoint,
  type TimelineQuery,
} from '@doctor-tracker/shared';
import { Doctor, Patient } from '../../models';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Totals use collection metadata (estimatedDocumentCount). Per-status and
 * per-condition counts run in parallel, each answered from the
 * { status, admissionDate } / { condition, admissionDate } indexes without
 * reading documents, instead of one $group that scans the whole collection.
 */
export async function overview(): Promise<StatsOverview> {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [totalDoctors, totalPatients, statusCounts, conditionCounts, admissionsLast30Days, newDoctorsLast30Days] =
    await Promise.all([
      Doctor.estimatedDocumentCount(),
      Patient.estimatedDocumentCount(),
      Promise.all(PATIENT_STATUSES.map((status) => Patient.countDocuments({ status }))),
      Promise.all(CONDITIONS.map((condition) => Patient.countDocuments({ condition }))),
      Patient.countDocuments({ admissionDate: { $gte: since } }),
      Doctor.countDocuments({ createdAt: { $gte: since } }),
    ]);

  const patientsByStatus = Object.fromEntries(
    PATIENT_STATUSES.map((s, i) => [s, statusCounts[i] ?? 0]),
  ) as StatsOverview['patientsByStatus'];

  const patientsByCondition = CONDITIONS.map((condition, i) => ({ condition, count: conditionCounts[i] ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return { totalDoctors, totalPatients, patientsByStatus, patientsByCondition, admissionsLast30Days, newDoctorsLast30Days };
}

/** Top-N doctors by patient count. Groups on the { doctor } index prefix, then joins only N doctors. */
export async function patientsPerDoctor(limit: number): Promise<PatientsPerDoctorItem[]> {
  const rows = await Patient.aggregate<{ _id: Types.ObjectId; count: number; doctor: { name: string; specialization: string } }>([
    { $sort: { doctor: 1 } },
    { $group: { _id: '$doctor', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: Doctor.collection.name,
        localField: '_id',
        foreignField: '_id',
        pipeline: [{ $project: { name: 1, specialization: 1 } }],
        as: 'doctor',
      },
    },
    { $unwind: '$doctor' },
  ]);
  return rows.map((r) => ({
    doctor: { id: String(r._id), name: r.doctor.name, specialization: r.doctor.specialization as never },
    count: r.count,
  }));
}

function bucketKeys(from: Date, to: Date, interval: 'day' | 'month', tz: string): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    ...(interval === 'day' && { day: '2-digit' }),
  });
  const keys = new Set<string>();
  // Step in 6h so DST shifts never skip a local day; the Set de-duplicates.
  const step = interval === 'day' ? 6 * 60 * 60 * 1000 : DAY_MS;
  for (let t = from.getTime(); t <= to.getTime(); t += step) keys.add(fmt.format(new Date(t)));
  keys.add(fmt.format(to));
  return [...keys];
}

/** Admissions per day/month in the viewer's time zone, with empty buckets filled in. */
export async function timeline(q: TimelineQuery): Promise<TimelinePoint[]> {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - (q.interval === 'day' ? 29 : 365) * DAY_MS);
  const format = q.interval === 'day' ? '%Y-%m-%d' : '%Y-%m';

  const statusSums = Object.fromEntries(
    PATIENT_STATUSES.map((s) => [s, { $sum: { $cond: [{ $eq: ['$status', s] }, 1, 0] } }]),
  );

  const rows = await Patient.aggregate<TimelinePoint & { _id: string }>([
    { $match: { admissionDate: { $gte: from, $lte: to } } }, // { admissionDate } index range
    { $project: { admissionDate: 1, status: 1 } },
    {
      $group: {
        _id: { $dateToString: { date: '$admissionDate', format, timezone: q.tz } },
        total: { $sum: 1 },
        ...statusSums,
      },
    },
  ]);

  const byKey = new Map(rows.map((r) => [r._id, r]));
  return bucketKeys(from, to, q.interval, q.tz).map((bucket) => {
    const row = byKey.get(bucket);
    return {
      bucket,
      total: row?.total ?? 0,
      admitted: row?.admitted ?? 0,
      under_treatment: row?.under_treatment ?? 0,
      discharged: row?.discharged ?? 0,
    };
  });
}
