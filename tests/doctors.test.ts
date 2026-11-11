import { describe, expect, it } from 'vitest';
import { Doctor } from '../src/models';
import { buildSearchFilter } from '../src/utils/search';
import { loggedInAgent, validDoctor, validPatient } from './helpers';

describe('doctors', () => {
  it('creates a doctor and returns a clean DTO', async () => {
    const agent = await loggedInAgent();
    const res = await agent.post('/api/v1/doctors').send(validDoctor());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Dr. Ayesha Rahman', patientCount: 0 });
    expect(res.body.data.id).toMatch(/^[a-f\d]{24}$/);
    expect(res.body.data._id).toBeUndefined();
    expect(res.body.data.searchTokens).toBeUndefined();
    expect(res.body.data.__v).toBeUndefined();
  });

  it('validates input and lists every problem', async () => {
    const agent = await loggedInAgent();
    const res = await agent
      .post('/api/v1/doctors')
      .send({ name: '<script>', specialization: 'Wizardry', hospital: 'X', phone: 'abc', email: 'nope' });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['email', 'hospital', 'name', 'phone', 'specialization']);
  });

  it('rejects mass-assignment of internal fields', async () => {
    const agent = await loggedInAgent();
    for (const extra of [{ _id: '64b7f0c2a1b2c3d4e5f60718' }, { searchTokens: ['x'] }, { createdAt: '2020-01-01' }]) {
      const res = await agent.post('/api/v1/doctors').send(validDoctor(extra));
      expect(res.status).toBe(400);
    }
  });

  it('returns 409 on duplicate email without echoing the value', async () => {
    const agent = await loggedInAgent();
    await agent.post('/api/v1/doctors').send(validDoctor()).expect(201);
    const res = await agent.post('/api/v1/doctors').send(validDoctor({ email: 'AYESHA@hospital.dev' }));
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('ayesha@hospital.dev');
  });

  it('paginates, filters and searches', async () => {
    const agent = await loggedInAgent();
    const specs = ['Cardiology', 'Neurology', 'Oncology'];
    for (let i = 0; i < 12; i++) {
      await agent
        .post('/api/v1/doctors')
        .send(validDoctor({ name: `Dr. Person ${String.fromCharCode(65 + i)}son`, email: `d${i}@h.dev`, specialization: specs[i % 3] }))
        .expect(201);
    }
    await agent.post('/api/v1/doctors').send(validDoctor({ name: 'Dr. Zoë Ćirić', email: 'zoe@h.dev', hospital: 'United Hospital' }));

    const page2 = await agent.get('/api/v1/doctors?page=2&limit=5');
    expect(page2.body.meta).toEqual({ page: 2, limit: 5, total: 13, totalPages: 3 });
    expect(page2.body.data).toHaveLength(5);

    const neuro = await agent.get('/api/v1/doctors?specialization=Neurology');
    expect(neuro.body.meta.total).toBe(4);

    // prefix, case- and accent-insensitive
    const zoe = await agent.get('/api/v1/doctors?search=zoe ciri');
    expect(zoe.body.data.map((d: { email: string }) => d.email)).toEqual(['zoe@h.dev']);

    const hospital = await agent.get('/api/v1/doctors?search=united');
    expect(hospital.body.meta.total).toBe(1);

    const byName = await agent.get('/api/v1/doctors?sort=name&order=asc&limit=1');
    expect(byName.body.data[0].name).toBe('Dr. Person Ason');
  });

  it('treats regex characters in search as literals (no ReDoS / injection)', async () => {
    const agent = await loggedInAgent();
    await agent.post('/api/v1/doctors').send(validDoctor()).expect(201);
    for (const q of ['.*', '(a+)+$', '[', '\\', '$where']) {
      const res = await agent.get(`/api/v1/doctors?search=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
    }
    // Only escaped, anchored word prefixes ever reach MongoDB.
    const filter = buildSearchFilter('(a+)+$ .* zoë') as { searchTokens: { $all: RegExp[] } };
    expect(filter.searchTokens.$all.map((r) => r.source)).toEqual(['^a', '^zoe']);
    expect(buildSearchFilter('.*[]\\')).toEqual({});
  });

  it('ignores operator-shaped query keys and rejects repeated params', async () => {
    const agent = await loggedInAgent();
    await agent.post('/api/v1/doctors').send(validDoctor()).expect(201);
    const op = await agent.get('/api/v1/doctors?specialization[$ne]=x');
    expect(op.status).toBe(200);
    expect(op.body.meta.total).toBe(1);
    const dup = await agent.get('/api/v1/doctors?specialization=Cardiology&specialization=Neurology');
    expect(dup.status).toBe(400);
  });

  it('caps limit and page', async () => {
    const agent = await loggedInAgent();
    expect((await agent.get('/api/v1/doctors?limit=5000')).status).toBe(400);
    expect((await agent.get('/api/v1/doctors?page=999999')).status).toBe(400);
  });

  it('filters by created date range', async () => {
    const agent = await loggedInAgent();
    await agent.post('/api/v1/doctors').send(validDoctor()).expect(201);
    await Doctor.create({ ...validDoctor({ email: 'old@h.dev' }), specialization: 'Cardiology' as const, createdAt: new Date('2024-01-15') });
    const res = await agent.get('/api/v1/doctors?from=2024-01-01&to=2024-01-31');
    expect(res.body.data.map((d: { email: string }) => d.email)).toEqual(['old@h.dev']);
    expect((await agent.get('/api/v1/doctors?from=2024-02-01&to=2024-01-01')).status).toBe(400);
  });

  it('gets, updates (recomputing search tokens) and 404s', async () => {
    const agent = await loggedInAgent();
    const { body } = await agent.post('/api/v1/doctors').send(validDoctor()).expect(201);
    const id = body.data.id;

    const updated = await agent.patch(`/api/v1/doctors/${id}`).send({ name: 'Dr. Nusrat Jahan' });
    expect(updated.status).toBe(200);
    expect((await agent.get('/api/v1/doctors?search=nusrat')).body.meta.total).toBe(1);
    expect((await agent.get('/api/v1/doctors?search=rahman')).body.meta.total).toBe(0);

    expect((await agent.patch(`/api/v1/doctors/${id}`).send({})).status).toBe(400);
    expect((await agent.get('/api/v1/doctors/not-an-id')).status).toBe(400);
    expect((await agent.get('/api/v1/doctors/64b7f0c2a1b2c3d4e5f60718')).status).toBe(404);
  });

  it("manages a doctor's patients", async () => {
    const agent = await loggedInAgent();
    const d1 = (await agent.post('/api/v1/doctors').send(validDoctor())).body.data.id;
    const d2 = (await agent.post('/api/v1/doctors').send(validDoctor({ email: 'two@h.dev' }))).body.data.id;

    const created = await agent.post(`/api/v1/doctors/${d1}/patients`).send(validPatient());
    expect(created.status).toBe(201);
    expect(created.body.data.doctor).toMatchObject({ id: d1, name: 'Dr. Ayesha Rahman' });
    await agent.post(`/api/v1/doctors/${d1}/patients`).send(validPatient({ email: 'p2@mail.dev' })).expect(201);
    await agent.post(`/api/v1/doctors/${d2}/patients`).send(validPatient({ email: 'p3@mail.dev' })).expect(201);

    const list = await agent.get(`/api/v1/doctors/${d1}/patients`);
    expect(list.body.meta.total).toBe(2);
    expect((await agent.get(`/api/v1/doctors/${d1}`)).body.data.patientCount).toBe(2);
    const doctors = await agent.get('/api/v1/doctors?sort=createdAt&order=asc');
    expect(doctors.body.data.map((d: { patientCount: number }) => d.patientCount)).toEqual([2, 1]);

    const pid = created.body.data.id;
    // deleting through the wrong doctor must not work
    expect((await agent.delete(`/api/v1/doctors/${d2}/patients/${pid}`)).status).toBe(404);
    expect((await agent.delete(`/api/v1/doctors/${d1}/patients/${pid}`)).status).toBe(204);
    expect((await agent.get(`/api/v1/doctors/${d1}/patients`)).body.meta.total).toBe(1);

    expect((await agent.post('/api/v1/doctors/64b7f0c2a1b2c3d4e5f60718/patients').send(validPatient())).status).toBe(404);
  });
});
