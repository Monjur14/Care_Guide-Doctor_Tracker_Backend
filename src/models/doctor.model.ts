import { Schema, model, type InferSchemaType } from 'mongoose';
import { SPECIALIZATIONS } from '@doctor-tracker/shared';
import { buildSearchTokens } from '../utils/search';

const doctorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    specialization: { type: String, required: true, enum: SPECIALIZATIONS },
    hospital: { type: String, required: true, trim: true, maxlength: 150 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    searchTokens: { type: [String], select: false, default: [] },
  },
  { timestamps: true },
);

doctorSchema.pre('validate', function () {
  this.searchTokens = buildSearchTokens({
    text: [this.name, this.hospital, this.specialization],
    email: this.email,
    phone: this.phone,
  });
});

// Each index backs a specific query in doctors.service / stats.service.
// Sorts always end with _id (stable pagination), so compound indexes include it too:
// that lets MongoDB walk the index in order instead of sorting in memory.
doctorSchema.index({ email: 1 }, { unique: true }); // uniqueness + lookups
doctorSchema.index({ createdAt: -1, _id: -1 }); // default list sort, date filter, stable paging
doctorSchema.index({ specialization: 1, createdAt: -1, _id: -1 }); // filter by specialization
doctorSchema.index({ hospital: 1, createdAt: -1, _id: -1 }); // filter by hospital + distinct hospitals
doctorSchema.index({ name: 1, _id: 1 }); // sort by name
doctorSchema.index({ searchTokens: 1 }); // prefix search (multikey)

export type DoctorDoc = InferSchemaType<typeof doctorSchema>;
export const Doctor = model('Doctor', doctorSchema);
