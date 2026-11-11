import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

/*
 * In-memory stores are per instance. On serverless this is a best-effort first
 * line; the durable brute-force control is the per-account lockout stored in
 * MongoDB (see auth.service). A shared store (e.g. Redis) is the upgrade path.
 */
const skip = () => env.NODE_ENV === 'test';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip,
  handler: (_req, _res, next) => next(AppError.tooManyRequests()),
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  handler: (_req, _res, next) => next(AppError.tooManyRequests('Too many login attempts, please try again later')),
});
