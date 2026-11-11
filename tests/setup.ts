import { afterAll, beforeAll, beforeEach, inject } from 'vitest';

// Must be set before any module that reads src/config/env is imported.
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = inject('mongoUri');
process.env.JWT_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.BCRYPT_ROUNDS = '4';

const { connectDB, disconnectDB } = await import('../src/config/db');
const { Doctor, Patient, User } = await import('../src/models');

beforeAll(async () => {
  await connectDB();
  await Promise.all([User.init(), Doctor.init(), Patient.init()]); // build indexes
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Doctor.deleteMany({}), Patient.deleteMany({})]);
});

afterAll(async () => {
  await disconnectDB();
});
