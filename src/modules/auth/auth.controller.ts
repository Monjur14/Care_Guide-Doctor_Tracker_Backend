import type { Request, Response } from 'express';
import { loginSchema } from '@doctor-tracker/shared';
import * as authService from './auth.service';
import { SESSION_COOKIE, clearCookieOptions, sessionCookieOptions } from './session';

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const { token, user } = await authService.login(input, req.ip);
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
  res.status(200).json({ data: user });
}

export async function logout(req: Request, res: Response) {
  await authService.logout(req.user!.id);
  res.clearCookie(SESSION_COOKIE, clearCookieOptions());
  res.status(204).end();
}

export function me(req: Request, res: Response) {
  res.json({ data: req.user });
}
