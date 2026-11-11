import { z } from 'zod';
import { dateRangeFields, refineDateRange } from './common';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const timelineQuerySchema = z
  .object({
    ...dateRangeFields,
    interval: z.enum(['day', 'month']).default('day'),
    tz: z.string().max(64).refine(isValidTimeZone, 'Invalid time zone').default('UTC'),
  })
  .superRefine(refineDateRange)
  .superRefine((v, ctx) => {
    if (!v.from || !v.to) return;
    const days = (v.to.getTime() - v.from.getTime()) / MS_PER_DAY;
    const max = v.interval === 'day' ? 366 : 366 * 5;
    if (days > max) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: `Range too large for "${v.interval}" interval` });
    }
  });
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

export const patientsPerDoctorQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type PatientsPerDoctorQuery = z.infer<typeof patientsPerDoctorQuerySchema>;
