import type { Condition, Gender, PatientStatus, Specialization, UserRole } from './constants';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiList<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
    requestId?: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface Doctor {
  id: string;
  name: string;
  specialization: Specialization;
  hospital: string;
  phone: string;
  email: string;
  patientCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorSummary {
  id: string;
  name: string;
  specialization: Specialization;
}

export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: Gender;
  phone: string;
  email: string;
  condition: Condition;
  status: PatientStatus;
  admissionDate: string;
  doctor: DoctorSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatsOverview {
  totalDoctors: number;
  totalPatients: number;
  patientsByStatus: Record<PatientStatus, number>;
  patientsByCondition: { condition: Condition; count: number }[];
  admissionsLast30Days: number;
  newDoctorsLast30Days: number;
}

export interface PatientsPerDoctorItem {
  doctor: DoctorSummary;
  count: number;
}

export interface TimelinePoint {
  bucket: string;
  total: number;
  admitted: number;
  under_treatment: number;
  discharged: number;
}

export interface FilterOptions {
  specializations: readonly Specialization[];
  conditions: readonly Condition[];
  statuses: readonly PatientStatus[];
  genders: readonly Gender[];
  hospitals: string[];
}
