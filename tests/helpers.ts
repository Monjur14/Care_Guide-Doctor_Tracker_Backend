import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models';
import { hashPassword } from '../src/modules/auth/auth.service';

export const app = createApp();

export const ADMIN = { email: 'admin@test.dev', password: 'Correct-Horse-Battery-1' };
export const ORIGIN = 'http://localhost:3000';

export async function createAdmin() {
  return User.create({ email: ADMIN.email, passwordHash: await hashPassword(ADMIN.password), role: 'admin' });
}

/** A supertest agent that keeps the session cookie between requests. */
export async function loggedInAgent() {
  await createAdmin();
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send(ADMIN);
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export const validDoctor = (overrides: Record<string, unknown> = {}) => ({
  name: 'Dr. Ayesha Rahman',
  specialization: 'Cardiology',
  hospital: 'Square Hospital',
  phone: '+880 1711 123456',
  email: 'ayesha@hospital.dev',
  ...overrides,
});

export const validPatient = (overrides: Record<string, unknown> = {}) => ({
  name: 'Karim Hossain',
  age: 45,
  gender: 'male',
  phone: '+880 1811 654321',
  email: 'karim@mail.dev',
  condition: 'Diabetes',
  status: 'admitted',
  admissionDate: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  ...overrides,
});

export { request };
