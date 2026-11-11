/**
 * Seeds the admin user and realistic demo data.
 *   npm run seed             -> upsert admin, add demo data if collections are empty
 *   npm run seed -- --reset  -> wipe doctors & patients first
 * Refuses to run against production unless --force is passed.
 */
import { faker } from '@faker-js/faker';
import { CONDITIONS, GENDERS, PATIENT_STATUSES, SPECIALIZATIONS } from '@doctor-tracker/shared';
import { z } from 'zod';
import { connectDB, disconnectDB } from '../src/config/db';
import { isProd } from '../src/config/env';
import { Doctor, Patient, User } from '../src/models';
import { hashPassword } from '../src/modules/auth/auth.service';

const args = new Set(process.argv.slice(2));
if (isProd && !args.has('--force')) {
  console.error('Refusing to seed in production without --force');
  process.exit(1);
}

const seedEnv = z
  .object({
    SEED_ADMIN_EMAIL: z.email(),
    SEED_ADMIN_PASSWORD: z.string().min(12, 'SEED_ADMIN_PASSWORD must be at least 12 characters'),
  })
  .parse(process.env);

const DOCTORS = 40;
const PATIENTS = 800;
const HOSPITALS = [
  'Dhaka Medical College Hospital',
  'Square Hospital',
  'United Hospital',
  'Evercare Hospital',
  'Labaid Specialized Hospital',
  'BIRDEM General Hospital',
  'Ibn Sina Hospital',
  'Popular Medical College Hospital',
];

faker.seed(42);
const bdPhone = () => `+880 1${faker.helpers.arrayElement(['3', '5', '6', '7', '8', '9'])}${faker.string.numeric(2)} ${faker.string.numeric(6)}`;

await connectDB();

const email = seedEnv.SEED_ADMIN_EMAIL.toLowerCase();
await User.updateOne(
  { email },
  {
    $set: { passwordHash: await hashPassword(seedEnv.SEED_ADMIN_PASSWORD), role: 'admin', failedLoginAttempts: 0, lockUntil: null },
    $setOnInsert: { email, tokenVersion: 0 },
  },
  { upsert: true },
);
console.log(`Admin ready: ${email}`);

if (args.has('--reset')) {
  await Promise.all([Doctor.deleteMany({}), Patient.deleteMany({})]);
  console.log('Cleared doctors and patients');
}

if ((await Doctor.estimatedDocumentCount()) > 0) {
  console.log('Demo data already present (use --reset to regenerate)');
} else {
  const now = Date.now();
  const yearAgo = now - 365 * 24 * 60 * 60 * 1000;

  const doctors = await Doctor.insertMany(
    Array.from({ length: DOCTORS }, () => {
      const first = faker.person.firstName();
      const last = faker.person.lastName();
      const createdAt = faker.date.between({ from: yearAgo, to: now });
      return {
        name: `Dr. ${first} ${last}`,
        specialization: faker.helpers.arrayElement(SPECIALIZATIONS),
        hospital: faker.helpers.arrayElement(HOSPITALS),
        phone: bdPhone(),
        email: faker.internet.email({ firstName: first, lastName: last, provider: 'doctortracker.dev' }).toLowerCase(),
        createdAt,
        updatedAt: createdAt,
      };
    }),
  );

  // Skewed distribution so "patients per doctor" is an interesting chart.
  const weights = doctors.map(() => faker.number.float({ min: 0.2, max: 3 }));
  const patients = Array.from({ length: PATIENTS }, () => {
    const doctor = faker.helpers.weightedArrayElement(doctors.map((d, i) => ({ value: d, weight: weights[i]! })));
    const gender = faker.helpers.arrayElement(GENDERS);
    const sex = gender === 'other' ? undefined : gender;
    const first = faker.person.firstName(sex);
    const last = faker.person.lastName();
    const admissionDate = faker.date.between({ from: Math.max(doctor.createdAt.getTime(), yearAgo), to: now });
    const ageDays = (now - admissionDate.getTime()) / 86_400_000;
    const status =
      ageDays < 7
        ? faker.helpers.arrayElement(['admitted', 'under_treatment'] as const)
        : faker.helpers.weightedArrayElement([
            { value: PATIENT_STATUSES[2], weight: 6 },
            { value: PATIENT_STATUSES[1], weight: 3 },
            { value: PATIENT_STATUSES[0], weight: 1 },
          ]);
    return {
      name: `${first} ${last}`,
      age: faker.number.int({ min: 1, max: 90 }),
      gender,
      phone: bdPhone(),
      email: faker.internet.email({ firstName: first, lastName: last }).toLowerCase(),
      condition: faker.helpers.arrayElement(CONDITIONS),
      status,
      admissionDate,
      doctor: doctor._id,
      createdAt: admissionDate,
      updatedAt: admissionDate,
    };
  });
  await Patient.insertMany(patients, { ordered: false });
  console.log(`Inserted ${DOCTORS} doctors and ${PATIENTS} patients`);
}

await disconnectDB();
