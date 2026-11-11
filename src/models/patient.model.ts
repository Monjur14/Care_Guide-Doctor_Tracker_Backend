import { Schema, model, type InferSchemaType } from 'mongoose';
import { CONDITIONS, GENDERS, PATIENT_STATUSES } from '@doctor-tracker/shared';
import { buildSearchTokens } from '../utils/search';

const patientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    age: { type: Number, required: true, min: 0, max: 130 },
    gender: { type: String, required: true, enum: GENDERS },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    condition: { type: String, required: true, enum: CONDITIONS },
    status: { type: String, required: true, enum: PATIENT_STATUSES },
    admissionDate: { type: Date, required: true },
    doctor: { type: Schema.Types.ObjectId, ref: 'Doctor', required: true },
    searchTokens: { type: [String], select: false, default: [] },
  },
  { timestamps: true },
);

patientSchema.pre('validate', function () {
  this.searchTokens = buildSearchTokens({ text: [this.name], email: this.email, phone: this.phone });
});

// Each index backs a specific query in patients.service / stats.service.
// Compound indexes end with _id to match the stable sort (no in-memory SORT stage).
patientSchema.index({ doctor: 1, admissionDate: -1, _id: -1 }); // a doctor's patients + patients-per-doctor
patientSchema.index({ admissionDate: -1, _id: -1 }); // default sort, date range, timeline
patientSchema.index({ condition: 1, admissionDate: -1, _id: -1 }); // condition filter + counts
patientSchema.index({ status: 1, admissionDate: -1, _id: -1 }); // status filter + counts
patientSchema.index({ createdAt: -1, _id: -1 }); // sort by created
patientSchema.index({ searchTokens: 1 }); // prefix search (multikey)

export type PatientDoc = InferSchemaType<typeof patientSchema>;
export const Patient = model('Patient', patientSchema);
