import type { RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const allowedOrigins = new Set(env.CORS_ORIGINS);

/** API-only CSP: this server never serves HTML, scripts or frames. */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: { maxAge: 63072000, includeSubDomains: true, preload: true },
});

export const corsPolicy = cors({
  origin(origin, callback) {
    // No Origin header: same-origin, server-to-server or curl. Browsers always send it cross-origin.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
});

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies):
 *  - state-changing requests from a browser must come from an allowed Origin;
 *  - bodies must be JSON, which a cross-site <form> cannot send without a CORS preflight.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  // Same-origin requests (e.g. "Try it out" in /api/docs) can't be cross-site forgeries.
  const sameOrigin = origin === `${req.protocol}://${req.get('host')}`;
  if (origin && !sameOrigin && !allowedOrigins.has(origin)) {
    req.log?.warn({ origin }, 'Blocked request from disallowed origin');
    return next(AppError.forbidden('Origin not allowed'));
  }

  const hasBody = Number(req.get('content-length') ?? 0) > 0 || req.get('transfer-encoding') !== undefined;
  if (hasBody && !req.is('application/json')) {
    return next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
  }
  next();
};

/** API responses contain patient data: never let browsers or proxies cache them. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
};
