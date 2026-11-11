import bcrypt from 'bcryptjs';
import type { AuthUser, LoginInput } from '@doctor-tracker/shared';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { User } from '../../models';
import { AppError } from '../../utils/AppError';
import { signSessionToken } from './session';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

// Compared against when the email is unknown, so response time doesn't reveal which emails exist.
// Computed lazily to keep serverless cold starts fast.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash('not-a-real-password-dummy-value', env.BCRYPT_ROUNDS));

const INVALID_CREDENTIALS = 'Invalid email or password';

export async function hashPassword(password: string) {
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw AppError.badRequest('Password must be at most 72 bytes');
  }
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
}

export async function login(input: LoginInput, ip: string | undefined): Promise<{ token: string; user: AuthUser }> {
  const user = await User.findOne({ email: input.email })
    .select('+passwordHash +tokenVersion +failedLoginAttempts +lockUntil')
    .exec();

  if (!user) {
    await bcrypt.compare(input.password, await getDummyHash());
    logger.warn({ event: 'auth.login_failed', reason: 'unknown_user', ip }, 'Login failed');
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    logger.warn({ event: 'auth.login_locked', userId: user.id, ip }, 'Login attempt on locked account');
    throw AppError.tooManyRequests('Too many failed attempts. Try again later.');
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await User.updateOne(
      { _id: user._id },
      locked
        ? { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_DURATION_MS) } }
        : { $inc: { failedLoginAttempts: 1 } },
    );
    logger.warn(
      { event: locked ? 'auth.account_locked' : 'auth.login_failed', userId: user.id, attempts, ip },
      locked ? 'Account locked after repeated failures' : 'Login failed',
    );
    throw AppError.unauthorized(INVALID_CREDENTIALS);
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } },
  );
  logger.info({ event: 'auth.login_success', userId: user.id, ip }, 'Login succeeded');

  const token = signSessionToken({ sub: user.id, role: user.role, ver: user.tokenVersion ?? 0 });
  return { token, user: { id: user.id, email: user.email, role: user.role } };
}

/** Revokes every session of the user by bumping tokenVersion. */
export async function logout(userId: string) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  logger.info({ event: 'auth.logout', userId }, 'User logged out');
}
