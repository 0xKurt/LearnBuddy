import { z } from 'zod';

export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
/** Learner-local calendar date. */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
/** Learner-local wall time. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

export const AppLocale = z.enum(['de', 'en', 'fr', 'es', 'it']);
export type AppLocale = z.infer<typeof AppLocale>;

export const ApiErrorCode = z.enum([
  'unauthenticated',
  'admin_required',
  'forbidden',
  'not_found',
  'conflict',
  'stale',
  'too_large',
  'invalid_input',
  'pin_locked',
  'rate_limited',
  'budget_exhausted',
  'internal',
  'model_unavailable',
  'unavailable',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorEnvelope = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelope>;

export const SubjectKind = z.enum([
  'math',
  'physics',
  'chemistry',
  'biology',
  'geography',
  'history',
  'german',
  'english',
  'french',
  'spanish',
  'latin',
  'other_language',
  'religion_ethics',
  'art_music',
  'computer_science',
  'economics',
  'social_studies',
  'other',
]);
export type SubjectKind = z.infer<typeof SubjectKind>;
