export const SPECIALIZATIONS = [
  'Cardiology',
  'Dermatology',
  'Endocrinology',
  'Gastroenterology',
  'General Medicine',
  'Gynecology',
  'Nephrology',
  'Neurology',
  'Oncology',
  'Orthopedics',
  'Pediatrics',
  'Psychiatry',
  'Pulmonology',
  'Urology',
] as const;
export type Specialization = (typeof SPECIALIZATIONS)[number];

export const CONDITIONS = [
  'Asthma',
  'Cancer',
  'COVID-19',
  'Dengue',
  'Diabetes',
  'Fracture',
  'Heart Disease',
  'Hypertension',
  'Kidney Disease',
  'Migraine',
  'Pneumonia',
  'Other',
] as const;
export type Condition = (typeof CONDITIONS)[number];

export const PATIENT_STATUSES = ['admitted', 'under_treatment', 'discharged'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const USER_ROLES = ['admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PAGINATION = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  /** Caps skip-based pagination so a huge ?page= can't force a deep collection scan. */
  MAX_PAGE: 1000,
} as const;

export const SEARCH_MAX_LENGTH = 100;
