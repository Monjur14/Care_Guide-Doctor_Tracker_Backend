import { describe, expect, it } from 'vitest';
import { loggedInAgent, validDoctor, validPatient } from './helpers';

async function setup() {
  const agent = await loggedInAgent();
  const d1 = (await agent.post('/api/v1/doctors').send(validDoctor())).body.data.id as string;
  const d2 = (await agent.post('/api/v1/doctors').send(validDoctor({ email: 'two@h.dev', name: 'Dr. Two' }))).body.data.id as string;
  const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
  const rows = [
    { doctor: d1, p: { name: 'Rahim Uddin', condition: 'Diabetes', status: 'admitted', admissionDate: day(1), age: 30 } },
    { doctor: d1, p: { name: 'Fatema Begum', condition: 'Asthma', status: 'discharged', admissionDate: day(40), age: 60, gender: 'female' } },
    { doctor: d2, p: { name: 'Jamal Khan', condition: 'Diabetes', status: 'under_treatment', admissionDate: day(10), age: 50 } },
    { doctor: d2, p: { name: 'Joya Ahsan', condition: 'Migraine', status: 'admitted', admissionDate: day(3), age: 25, gender: 'female', phone: '+880 1999 000111' } },
  ];
  const ids: string[] = [];
  for (const [i, r] of rows.entries()) {
    const res = await agent.post(`/api/v1/doctors/${r.doctor}/patients`).send(validPatient({ ...r.p, email: `p${i}@mail.dev` }));
    expect(res.status).toBe(201);
    ids.push(res.body.data.id);
  }
  return { agent, d1, d2, ids };
}

describe('patients', () => {
  it('lists with doctor info, newest admission first', async () => {
    const { agent } = await setup();
    const res = await agent.get('/api/v1/patients');
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(4);
    expect(res.body.data.map((p: { name: string }) => p.name)).toEqual(['Rahim Uddin', 'Joya Ahsan', 'Jamal Khan', 'Fatema Begum']);
    expect(res.body.data[0].doctor).toMatchObject({ name: 'Dr. Ayesha Rahman', specialization: 'Cardiology' });
  });

  it('filters by condition, status, gender, doctor, age and date range', async () => {
    const { agent, d2 } = await setup();
    const total = async (qs: string) => (await agent.get(`/api/v1/patients?${qs}`)).body.meta.total;
    expect(await total('condition=Diabetes')).toBe(2);
    expect(await total('status=admitted')).toBe(2);
    expect(await total('gender=female')).toBe(2);
    expect(await total(`doctorId=${d2}`)).toBe(2);
    expect(await total('minAge=40&maxAge=55')).toBe(1);
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();
    expect(await total(`from=${from}`)).toBe(2);
    expect(await total(`condition=Diabetes&from=${from}`)).toBe(1);
    expect((await agent.get('/api/v1/patients?condition=Flu')).status).toBe(400);
    expect((await agent.get('/api/v1/patients?minAge=60&maxAge=10')).status).toBe(400);
  });

  it('searches by name prefix, email and phone', async () => {
    const { agent } = await setup();
    const names = async (q: string) =>
      (await agent.get(`/api/v1/patients?search=${encodeURIComponent(q)}`)).body.data.map((p: { name: string }) => p.name).sort();
    expect(await names('jo')).toEqual(['Joya Ahsan']);
    expect(await names('ja kh')).toEqual(['Jamal Khan']);
    expect(await names('p2@mail')).toEqual(['Jamal Khan']);
    expect(await names('01999')).toEqual(['Joya Ahsan']);
  });

  it('updates fields and reassigns doctor', async () => {
    const { agent, d2, ids } = await setup();
    const res = await agent.patch(`/api/v1/patients/${ids[0]}`).send({ status: 'discharged', doctorId: d2 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'discharged', doctor: { id: d2 } });

    expect((await agent.patch(`/api/v1/patients/${ids[0]}`).send({ doctorId: '64b7f0c2a1b2c3d4e5f60718' })).status).toBe(404);
    expect((await agent.patch(`/api/v1/patients/${ids[0]}`).send({ age: -1 })).status).toBe(400);
    expect((await agent.patch(`/api/v1/patients/${ids[0]}`).send({ doctor: d2 })).status).toBe(400);
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
    expect((await agent.patch(`/api/v1/patients/${ids[0]}`).send({ admissionDate: future })).status).toBe(400);
  });

  it('deletes and 404s afterwards', async () => {
    const { agent, ids } = await setup();
    expect((await agent.delete(`/api/v1/patients/${ids[1]}`)).status).toBe(204);
    expect((await agent.get(`/api/v1/patients/${ids[1]}`)).status).toBe(404);
    expect((await agent.delete(`/api/v1/patients/${ids[1]}`)).status).toBe(404);
  });

  it('sorts by allowed fields only', async () => {
    const { agent } = await setup();
    const res = await agent.get('/api/v1/patients?sort=age&order=asc');
    expect(res.body.data.map((p: { age: number }) => p.age)).toEqual([25, 30, 50, 60]);
    expect((await agent.get('/api/v1/patients?sort=passwordHash')).status).toBe(400);
  });
});

export { setup as seedPatients };
