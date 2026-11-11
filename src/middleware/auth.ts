import type { RequestHandler } from 'express';
import type { UserRole } from '@doctor-tracker/shared';
import { User } from '../models';
import { AppError } from '../utils/AppError';
import { clearCookieOptions, SESSION_COOKIE, verifySessionToken } from '../modules/auth/session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; email: string; role: UserRole };
  }
}

/** Verifies the session cookie and that the token has not been revoked. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length === 0) throw AppError.unauthorized();

  const payload = verifySessionToken(token);
  if (!payload) {
    req.log?.warn('Rejected invalid or expired session token');
    // Drop the dead cookie, or the frontend's cookie-presence gate keeps
    // bouncing /login -> /dashboard -> 401 -> /login in a loop.
    res.clearCookie(SESSION_COOKIE, clearCookieOptions());
    throw AppError.unauthorized('Session expired, please sign in again');
  }

  const user = await User.findById(payload.sub).select('+tokenVersion email role').lean();
  if (!user || user.tokenVersion !== payload.ver) {
    req.log?.warn({ userId: payload.sub }, 'Rejected revoked session token');
    res.clearCookie(SESSION_COOKIE, clearCookieOptions());
    throw AppError.unauthorized('Session expired, please sign in again');
  }

  req.user = { id: String(user._id), email: user.email, role: user.role };
  next();
};

/** Deny by default: every protected router declares which roles may use it. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
