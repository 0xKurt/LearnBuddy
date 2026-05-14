import { z } from 'zod';

export const ApiErrorPayload = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const ApiErrorEnvelope = z.object({
  error: ApiErrorPayload,
});
export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelope>;

export const ApiErrorCode = z.enum([
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'validation_failed',
  'rate_limited',
  'insufficient_credits',
  'learner_already_exists',
  'not_educational',
  'extraction_failed',
  'safety_blocked',
  'internal',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;
