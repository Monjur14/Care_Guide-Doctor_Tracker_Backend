import { describe, expect, it } from 'vitest';
import { loggedInAgent, validDoctor, validPatient } from './helpers';

describe('stats & meta', () => {
  it('computes overview, patients per doctor and a gap-filled timeline', async () => {
    const agent = await loggedInAgent();
    const d1 = (await agent.post('/api/v1/doctors').send(validDoctor())).body.data.id;
    const d2 = (await agent.post('/api/v1/doctors').send(validDoctor({ email: 'b@h.dev', name: 'Dr. Bee', hospital: 'United Hospital' }))).body.data.id;
    const at = (iso: string) => new Date(iso).toISOString();
    const rows = [
      [d1, { status: 'admitted', condition: 'Diabetes', admissionDate: at('2026-01-03T10:00:00Z') }],
      [d1, { status: 'discharged', condition: 'Diabetes', admissionDate: at('2026-01-03T20:00:00Z') }], // Jan 4 in Dhaka
      [d1, { status: 'under_treatment', condition: 'Asthma', admissionDate: at('2026-01-05T08:00:00Z') }],
      [d2, { status: 'admitted', condition: 'Asthma', admissionDate: at('2026-01-05T09:00:00Z') }],
    ] as const;
    for (const [i, [doc, p]] of rows.entries()) {
      await agent.post(`/api/v1/doctors/${doc}/patients`).send(validPatient({ ...p, email: `s${i}@m.dev` })).expect(201);
    }

    const overview = (await agent.get('/api/v1/stats/overview')).body.data;
    expect(overview).toMatchObject({
      totalDoctors: 2,
      totalPatients: 4,
      patientsByStatus: { admitted: 2, under_treatment: 1, discharged: 1 },
      newDoctorsLast30Days: 2,
    });
    expect(overview.patientsByCondition).toEqual([
      { condition: 'Asthma', count: 2 },
      { condition: 'Diabetes', count: 2 },
    ]);

    const perDoctor = (await agent.get('/api/v1/stats/patients-per-doctor?limit=5')).body.data;
    expect(perDoctor).toEqual([
      { doctor: { id: d1, name: 'Dr. Ayesha Rahman', specialization: 'Cardiology' }, count: 3 },
      { doctor: { id: d2, name: 'Dr. Bee', specialization: 'Cardiology' }, count: 1 },
    ]);

    const utc = (await agent.get('/api/v1/stats/timeline?from=2026-01-02T00:00:00Z&to=2026-01-05T23:59:59Z&tz=UTC')).body.data;
    expect(utc.map((p: { bucket: string; total: number }) => [p.bucket, p.total])).toEqual([
      ['2026-01-02', 0],
      ['2026-01-03', 2],
      ['2026-01-04', 0],
      ['2026-01-05', 2],
    ]);
    const dhaka = (await agent.get('/api/v1/stats/timeline?from=2026-01-02T00:00:00Z&to=2026-01-05T23:59:59Z&tz=Asia/Dhaka')).body.data;
    expect(dhaka.find((p: { bucket: string }) => p.bucket === '2026-01-04')).toMatchObject({ total: 1, discharged: 1 });

    const monthly = (await agent.get('/api/v1/stats/timeline?from=2025-12-01T00:00:00Z&to=2026-01-31T00:00:00Z&interval=month')).body.data;
    expect(monthly.map((p: { bucket: string; total: number }) => [p.bucket, p.total])).toEqual([
      ['2025-12', 0],
      ['2026-01', 4],
    ]);

    expect((await agent.get('/api/v1/stats/timeline?tz=Mars/Olympus')).status).toBe(400);
    expect((await agent.get('/api/v1/stats/timeline?from=2020-01-01&to=2026-01-01')).status).toBe(400);

    const meta = await agent.get('/api/v1/meta/filters');
    expect(meta.body.data.hospitals).toEqual(['Square Hospital', 'United Hospital']);
    expect(meta.body.data.conditions).toContain('Diabetes');
  });
});
