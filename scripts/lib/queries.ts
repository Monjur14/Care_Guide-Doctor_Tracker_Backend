import type { Types } from 'mongoose';
import { Doctor, Patient } from '../../src/models';
import { buildSearchFilter } from '../../src/utils/search';

/** Representative hot queries, mirroring the services. Used by db:explain and the index tests. */
export function hotQueries(doctorId: Types.ObjectId) {
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return {
    'doctors: default list': () => Doctor.find({}).sort({ createdAt: -1, _id: -1 }).limit(10).explain(),
    'doctors: search "car"': () => Doctor.find(buildSearchFilter('car')).sort({ createdAt: -1, _id: -1 }).limit(10).explain(),
    'doctors: by specialization': () =>
      Doctor.find({ specialization: 'Cardiology' }).sort({ createdAt: -1, _id: -1 }).limit(10).explain(),
    'doctors: joined in date range': () =>
      Doctor.find({ createdAt: { $gte: from } }).sort({ createdAt: -1, _id: -1 }).limit(10).explain(),
    "patients: one doctor's list": () =>
      Patient.find({ doctor: doctorId }).sort({ admissionDate: -1, _id: -1 }).limit(10).explain(),
    'patients: default list': () => Patient.find({}).sort({ admissionDate: -1, _id: -1 }).limit(10).explain(),
    'patients: by condition': () =>
      Patient.find({ condition: 'Diabetes' }).sort({ admissionDate: -1, _id: -1 }).limit(10).explain(),
    'patients: by status + date range': () =>
      Patient.find({ status: 'admitted', admissionDate: { $gte: from } }).sort({ admissionDate: -1, _id: -1 }).limit(10).explain(),
    'patients: search "jo"': () => Patient.find(buildSearchFilter('jo')).sort({ admissionDate: -1, _id: -1 }).limit(10).explain(),
    // countDocuments() runs this exact pipeline; explain it directly.
    'stats: count by status': () =>
      Patient.aggregate([{ $match: { status: 'discharged' } }, { $group: { _id: 1, n: { $sum: 1 } } }]).explain(),
    'stats: patients per doctor': () =>
      Patient.aggregate([{ $sort: { doctor: 1 } }, { $group: { _id: '$doctor', count: { $sum: 1 } } }]).explain(),
    'stats: timeline range': () =>
      Patient.aggregate([{ $match: { admissionDate: { $gte: from } } }, { $project: { admissionDate: 1, status: 1 } }]).explain(),
  } as Record<string, () => Promise<unknown>>;
}
