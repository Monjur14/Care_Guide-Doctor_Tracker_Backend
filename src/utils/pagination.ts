import type { Model } from 'mongoose';
import type { PaginationMeta } from '@doctor-tracker/shared';

export function toSkip(page: number, limit: number) {
  return (page - 1) * limit;
}

export function buildMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

/** Unfiltered counts read collection metadata instead of scanning an index. */
export function countFor<T>(model: Model<T>, filter: Record<string, unknown>) {
  return Object.keys(filter).length === 0
    ? model.estimatedDocumentCount()
    : model.countDocuments(filter);
}

export function dateRangeFilter(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from && { $gte: from }), ...(to && { $lte: to }) };
}
