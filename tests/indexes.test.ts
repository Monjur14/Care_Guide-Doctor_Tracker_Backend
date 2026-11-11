import { faker } from '@faker-js/faker';
import { CONDITIONS, PATIENT_STATUSES, SPECIALIZATIONS } from '@doctor-tracker/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { Doctor, Patient } from '../src/models';
import { summarizePlan } from '../scripts/lib/plan';
import { hotQueries } from '../scripts/lib/queries';

describe('query plans', () => {
  beforeEach(async () => {
    faker.seed(7);
    const doctors = await Doctor.insertMany(
      Array.from({ length: 50 }, (_, i) => ({
        name: `Dr. ${faker.person.fullName()}`,
        specialization: faker.helpers.arrayElement(SPECIALIZATIONS),
        hospital: `Hospital ${i % 5}`,
        phone: '+880 1711 000000',
        email: `doc${i}@h.dev`,
      })),
    );
    await Patient.insertMany(
      Array.from({ length: 500 }, (_, i) => ({
        name: faker.person.fullName(),
        age: 40,
        gender: 'male',
        phone: '+880 1811 000000',
        email: `p${i}@m.dev`,
        condition: faker.helpers.arrayElement(CONDITIONS),
        status: faker.helpers.arrayElement(PATIENT_STATUSES),
        admissionDate: faker.date.recent({ days: 365 }),
        doctor: doctors[i % 50]!._id,
      })),
    );
  });

  it('insertMany populates searchTokens via the validate hook', async () => {
    const d = await Doctor.findOne().select('+searchTokens').lean();
    expect(d?.searchTokens?.length).toBeGreaterThan(2);
  });

  it('every hot query uses an index (no COLLSCAN, no in-memory SORT except search)', async () => {
    const doctor = await Doctor.findOne().lean();
    const results: Record<string, string> = {};
    for (const [name, run] of Object.entries(hotQueries(doctor!._id))) {
      const plan = summarizePlan(await run());
      const ok = plan.usesIndex && !plan.collScan;
      // Search uses a multikey token index, so its (small, limited) result set is sorted in memory.
      const sortOk = !plan.inMemorySort || name.includes('search');
      results[name] = ok && sortOk ? 'index' : `${plan.stages.join('<-')}`;
    }
    expect(Object.values(results).every((r) => r === 'index'), JSON.stringify(results, null, 2)).toBe(true);
  });
});
