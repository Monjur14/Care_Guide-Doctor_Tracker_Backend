import { z } from 'zod';
import { PAGINATION, SEARCH_MAX_LENGTH } from '../constants';

export const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, 'Invalid id')
  .meta({ description: 'MongoDB ObjectId (24 hex characters)', example: '6af330101aa8649de4127232' });

export const idParamSchema = z.object({ id: objectIdSchema });

/** Trimmed, length-limited free text; empty strings become undefined. */
const optionalSearch = z
  .string()
  .trim()
  .max(SEARCH_MAX_LENGTH)
  .optional()
  .transform((v) => (v ? v : undefined));

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(PAGINATION.MAX_PAGE).default(1),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: optionalSearch,
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** ISO date (YYYY-MM-DD) or full ISO datetime. */
export const isoDateSchema = z
  .coerce.date({ error: 'Invalid date' })
  .meta({ description: 'ISO 8601 date (YYYY-MM-DD) or date-time', example: '2026-11-01T00:00:00.000Z' });

export const dateRangeFields = {
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
};

export function refineDateRange<T extends { from?: Date | undefined; to?: Date | undefined }>(
  value: T,
  ctx: z.RefinementCtx,
) {
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: 'custom', path: ['from'], message: '"from" must be before "to"' });
  }
}

export const personNameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100)
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, 'Name contains invalid characters');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Invalid email'))
  .meta({ format: 'email', example: 'ayesha.rahman@squarehospital.dev' });

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{5,18}[0-9]$/, 'Invalid phone number')
  .meta({ example: '+880 1711 123456' });
