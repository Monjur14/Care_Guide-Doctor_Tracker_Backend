import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError, type ErrorDetail } from '../utils/AppError';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

function zodDetails(err: ZodError): ErrorDetail[] {
  return err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return new AppError(400, 'VALIDATION_ERROR', 'Validation failed', zodDetails(err));

  if (err instanceof mongoose.Error.CastError) {
    return new AppError(400, 'INVALID_ID', `Invalid value for "${err.path}"`);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return new AppError(400, 'VALIDATION_ERROR', 'Validation failed', details);
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as { code?: number; keyValue?: Record<string, unknown>; type?: string; status?: number };
    if (e.code === 11000) {
      // Name the field, never echo the submitted value.
      const fields = Object.keys(e.keyValue ?? {});
      return AppError.conflict(
        `A record with this ${fields.join(', ') || 'value'} already exists`,
        fields.map((f) => ({ path: f, message: 'Already in use' })),
      );
    }
    // body-parser errors
    if (e.type === 'entity.parse.failed') return new AppError(400, 'INVALID_JSON', 'Malformed JSON body');
    if (e.type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    if (e.type === 'charset.unsupported' || e.type === 'encoding.unsupported') {
      return new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Unsupported body encoding');
    }
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = normalizeError(err);
  if (appError.status >= 500) {
    req.log?.error({ err }, 'Unhandled error');
  }
  if (res.headersSent) return;
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
      requestId: String(req.id ?? ''),
    },
  });
};
