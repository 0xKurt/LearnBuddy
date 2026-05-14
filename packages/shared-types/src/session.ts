import { z } from 'zod';
import { Iso8601, Uuid } from './enums.js';

export const Session = z.object({
  id: Uuid,
  learner_id: Uuid,
  subject_id: Uuid.nullable(),
  test_mode: z.boolean(),
  started_at: Iso8601,
  ended_at: Iso8601.nullable(),
  attempts_count: z.number().int().nonnegative(),
  correct_count: z.number().int().nonnegative(),
  created_at: Iso8601,
});
export type Session = z.infer<typeof Session>;

export const SessionCreate = z.object({
  subject_id: Uuid.nullable().optional(),
  test_mode: z.boolean().default(false),
});
export type SessionCreate = z.infer<typeof SessionCreate>;

export const SessionEnd = z.object({
  ended_at: Iso8601,
  attempts_count: z.number().int().nonnegative(),
  correct_count: z.number().int().nonnegative(),
});
export type SessionEnd = z.infer<typeof SessionEnd>;
