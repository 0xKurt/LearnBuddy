import { z } from 'zod';

export const Uuid = z.string().uuid();
export const IsoDateTime = z.string().datetime({ offset: true });
/** Learner-local calendar date. */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
/** Learner-local wall time. */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:MM');

/**
 * A list in a response that older app builds must still read after the API
 * grows (audit M-69): an element this build does not understand (a new tool,
 * card, status) is left out instead of failing the whole response.
 */
export function tolerantArray<S extends z.ZodTypeAny>(element: S) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((item) => {
      const r = element.safeParse(item);
      return r.success ? [r.data as z.output<S>] : [];
    }),
  );
}

/**
 * Every request header the app sends to the API (docs/architecture.md §API).
 * A browser build only gets through CORS when the preflight allows each of
 * them, so the API's CORS, the dev stack and the app's client share this list:
 * a header the client adds without listing it here does not type-check.
 */
export const APP_REQUEST_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'x-timezone',
  'x-app-version',
  'x-admin-token',
] as const;
export type AppRequestHeader = (typeof APP_REQUEST_HEADERS)[number];

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
  'update_required',
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
