import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { User } from '../src/models';
import { ADMIN, ORIGIN, app, createAdmin, loggedInAgent, request } from './helpers';

describe('auth', () => {
  it('health check is public and leaks nothing', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it.each([
    ['/api/v1/doctors'],
    ['/api/v1/patients'],
    ['/api/v1/stats/overview'],
    ['/api/v1/meta/filters'],
    ['/api/v1/auth/me'],
    ['/api/v1/does-not-exist'],
  ])('GET %s without a session -> 401', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('logs in with valid credentials and sets a hardened cookie', async () => {
    await createAdmin();
    const res = await request(app).post('/api/v1/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: ADMIN.email, role: 'admin' });
    expect(res.body.data.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/dt_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns the same generic error for unknown email and wrong password', async () => {
    await createAdmin();
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@test.dev', password: 'x' });
    const wrong = await request(app).post('/api/v1/auth/login').send({ ...ADMIN, password: 'wrong' });
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('rejects NoSQL operator injection in the login body', async () => {
    await createAdmin();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown fields (mass assignment)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ ...ADMIN, role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('locks the account after 5 failed attempts, even for the right password', async () => {
    await createAdmin();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/auth/login').send({ ...ADMIN, password: 'wrong' }).expect(401);
    }
    const res = await request(app).post('/api/v1/auth/login').send(ADMIN);
    expect(res.status).toBe(429);
    const user = await User.findOne({ email: ADMIN.email }).select('+lockUntil');
    expect(user?.lockUntil?.getTime()).toBeGreaterThan(Date.now());
  });

  it('logout revokes the token server-side', async () => {
    const agent = await loggedInAgent();
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    // Capture the session cookie as an attacker would.
    const login = await request(app).post('/api/v1/auth/login').send(ADMIN);
    const stolen = String(login.headers['set-cookie']).split(';')[0]!;
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', stolen)).status).toBe(200);

    await agent.post('/api/v1/auth/logout').set('Origin', ORIGIN).expect(204);
    const replay = await request(app).get('/api/v1/auth/me').set('Cookie', stolen);
    expect(replay.status).toBe(401);
    // The dead cookie is cleared, so the frontend's cookie gate can't loop /login <-> /dashboard.
    expect(String(replay.headers['set-cookie'])).toMatch(/dt_session=;.*Expires=Thu, 01 Jan 1970/);
  });

  it('rejects tampered, unsigned and wrongly-signed tokens', async () => {
    const user = await createAdmin();
    const forged = jwt.sign({ role: 'admin', ver: 0 }, 'some-other-secret-that-is-long-enough!!', {
      subject: user.id,
      issuer: 'doctor-tracker-api',
      audience: 'doctor-tracker-web',
    });
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: user.id, role: 'admin', ver: 0, iss: 'doctor-tracker-api', aud: 'doctor-tracker-web' }),
    ).toString('base64url');
    for (const token of [forged, `${header}.${body}.`, 'garbage']) {
      const res = await request(app).get('/api/v1/auth/me').set('Cookie', `dt_session=${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('blocks state-changing requests from a foreign Origin (CSRF)', async () => {
    const agent = await loggedInAgent();
    const res = await agent
      .post('/api/v1/doctors')
      .set('Origin', 'https://evil.example')
      .send({ name: 'x' });
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('requires a JSON body for writes', async () => {
    const agent = await loggedInAgent();
    const res = await agent
      .post('/api/v1/doctors')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('name=x');
    expect(res.status).toBe(415);
  });

  it('rejects malformed and oversized JSON without leaking internals', async () => {
    const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(bad.body)).not.toMatch(/at .*\.js/);

    const big = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.dev', password: 'x'.repeat(20_000) });
    expect(big.status).toBe(413);
  });

  it('allows CORS only for the configured origin', async () => {
    const ok = await request(app).options('/api/v1/doctors').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const evil = await request(app).options('/api/v1/doctors').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
