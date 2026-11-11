import type { RequestHandler } from 'express';
import { connectDB } from '../config/db';

/** Lazily connects on the first request of a (serverless) instance. */
export const ensureDb: RequestHandler = async (_req, _res, next) => {
  await connectDB();
  next();
};
