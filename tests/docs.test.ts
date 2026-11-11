import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as S from '../src/docs/schemas';
import { buildOpenApiDocument } from '../src/docs/openapi';
import { app, loggedInAgent, request, validDoctor, validPatient } from './helpers';

describe('API documentation', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const doc = buildOpenApiDocument();
    await expect(SwaggerParser.validate(structuredClone(doc) as never)).resolves.toBeDefined();
    expect(doc.openapi).toBe('3.1.0');
    // Query params are generated from the shared Zod schemas
    const params = doc.paths['/patients'].get.parameters.map((p) => p.name);
    expect(params).toEqual(expect.arrayContaining(['page', 'limit', 'search', 'condition', 'status', 'from', 'to', 'sort']));
  });

  it('serves the spec and a Swagger UI page with a strict CSP', async () => {
    const spec = await request(app).get('/api/openapi.json');
    expect(spec.status).toBe(200);
    expect(spec.body.info.title).toBe('Doctor Tracker API');

    const page = await request(app).get('/api/docs');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    const csp = page.headers['content-security-policy'] as string;
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(page.text).toContain(`nonce="${nonce}"`);
    expect(page.text).toMatch(/integrity="sha384-/);
    expect(csp).toContain("frame-ancestors 'none'");
    // A fresh nonce on every request
    const again = await request(app).get('/api/docs');
    expect(again.headers['content-security-policy']).not.toBe(csp);
  });

  it('every documented operation exists', async () => {
    const agent = await loggedInAgent();
    const doc = buildOpenApiDocument();
    const fakeId = '64b7f0c2a1b2c3d4e5f60718';
    for (const [path, item] of Object.entries(doc.paths)) {
      const base = 'servers' in item ? '/api' : '/api/v1';
      for (const method of ['get', 'post', 'patch', 'delete'] as const) {
        if (!(method in item) || method === 'post' && path === '/auth/logout') continue;
        const url = base + path.replace(/\{[^}]+\}/g, fakeId);
        const res = await agent[method](url).send(method === 'get' || method === 'delete' ? undefined : {});
        expect(res.body?.error?.code, `${method.toUpperCase()} ${url}`).not.toBe('ROUTE_NOT_FOUND');
      }
    }
  });

  it('documented response schemas match real responses (contract test)', async () => {
    const agent = await loggedInAgent();
    const check = <T extends z.ZodType>(schema: T, body: unknown, label: string) => {
      const result = schema.safeParse(body);
      expect(result.success, `${label}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    };

    check(S.dataOf(S.authUser), (await agent.get('/api/v1/auth/me')).body, 'GET /auth/me');
    check(S.health, (await request(app).get('/api/health')).body, 'GET /health');

    const created = await agent.post('/api/v1/doctors').send(validDoctor());
    check(S.dataOf(S.doctor), created.body, 'POST /doctors');
    const doctorId = created.body.data.id;
    check(S.dataOf(S.doctor), (await agent.patch(`/api/v1/doctors/${doctorId}`).send({ hospital: 'United Hospital' })).body, 'PATCH /doctors/:id');
    check(S.dataOf(S.doctor), (await agent.get(`/api/v1/doctors/${doctorId}`)).body, 'GET /doctors/:id');

    const p = await agent.post(`/api/v1/doctors/${doctorId}/patients`).send(validPatient());
    check(S.dataOf(S.patient), p.body, 'POST /doctors/:id/patients');
    check(S.dataOf(S.patient), (await agent.patch(`/api/v1/patients/${p.body.data.id}`).send({ status: 'discharged' })).body, 'PATCH /patients/:id');
    check(S.dataOf(S.patient), (await agent.get(`/api/v1/patients/${p.body.data.id}`)).body, 'GET /patients/:id');

    check(S.listOf(S.doctor), (await agent.get('/api/v1/doctors')).body, 'GET /doctors');
    check(S.listOf(S.patient), (await agent.get('/api/v1/patients')).body, 'GET /patients');
    check(S.listOf(S.patient), (await agent.get(`/api/v1/doctors/${doctorId}/patients`)).body, 'GET /doctors/:id/patients');
    check(S.dataOf(S.statsOverview), (await agent.get('/api/v1/stats/overview')).body, 'GET /stats/overview');
    check(S.dataOf(z.array(S.patientsPerDoctorItem)), (await agent.get('/api/v1/stats/patients-per-doctor')).body, 'GET /stats/patients-per-doctor');
    check(S.dataOf(z.array(S.timelinePoint)), (await agent.get('/api/v1/stats/timeline?interval=month')).body, 'GET /stats/timeline');
    check(S.dataOf(S.filterOptions), (await agent.get('/api/v1/meta/filters')).body, 'GET /meta/filters');

    for (const res of [
      await agent.post('/api/v1/doctors').send({}),
      await agent.get('/api/v1/doctors/64b7f0c2a1b2c3d4e5f60718'),
      await request(app).get('/api/v1/doctors'),
    ]) {
      check(S.errorBody, res.body, `error ${res.status}`);
    }
  });

  it('allows same-origin writes (Try it out) but still blocks foreign origins', async () => {
    const agent = await loggedInAgent();
    const same = await agent.post('/api/v1/doctors').set('Host', 'api.test').set('Origin', 'http://api.test').send(validDoctor());
    expect(same.status).toBe(201);
    const foreign = await agent.post('/api/v1/doctors').set('Host', 'api.test').set('Origin', 'http://evil.test').send(validDoctor({ email: 'x@h.dev' }));
    expect(foreign.status).toBe(403);
  });
});
