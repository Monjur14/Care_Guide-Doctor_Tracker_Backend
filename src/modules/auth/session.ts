import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import type { UserRole } from '@doctor-tracker/shared';
import { env, isProd } from '../../config/env';

const ISSUER = 'doctor-tracker-api';
const AUDIENCE = 'doctor-tracker-web';
const ALGORITHM = 'HS256' as const;

/** `__Host-` prefix (prod) pins the cookie to this exact host, HTTPS only, path=/. */
export const SESSION_COOKIE = isProd ? '__Host-dt_session' : 'dt_session';

export interface SessionPayload {
  sub: string;
  role: UserRole;
  ver: number;
}

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign({ role: payload.role, ver: payload.ver }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: payload.sub,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.SESSION_TTL_MINUTES * 60,
  });
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [ALGORITHM], // pin the algorithm: rejects "none" and alg-confusion tokens
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string' || typeof decoded.ver !== 'number') {
      return null;
    }
    return { sub: decoded.sub, role: decoded.role as UserRole, ver: decoded.ver };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true, // not readable from JavaScript (XSS can't steal it)
    secure: isProd, // HTTPS only in production
    sameSite: 'lax', // not sent on cross-site POST/PATCH/DELETE
    path: '/',
    maxAge: env.SESSION_TTL_MINUTES * 60 * 1000,
  };
}

export function clearCookieOptions(): CookieOptions {
  const { maxAge, ...rest } = sessionCookieOptions();
  void maxAge;
  return rest;
}
