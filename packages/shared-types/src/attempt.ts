import { z } from 'zod';
import { AnswerMode, EvaluatedBy, Iso8601, Uuid, Verdict } from './enums.js';

export const Attempt = z.object({
  id: Uuid,
  item_id: Uuid,
  learner_id: Uuid,
  session_id: Uuid.nullable(),
  mode: AnswerMode,
  kid_answer: z.string().nullable(),
  verdict: Verdict,
  evaluated_by: EvaluatedBy,
  evaluation_model: z.string().nullable(),
  evaluation_prompt_version: z.string().nullable(),
  feedback: z.string().nullable(),
  hints_used: z.number().int().nonnegative(),
  duration_ms: z.number().int().nullable(),
  test_mode: z.boolean(),
  created_at: Iso8601,
});
export type Attempt = z.infer<typeof Attempt>;

export const AttemptCreate = z.object({
  client_id: Uuid,
  item_id: Uuid,
  session_id: Uuid.nullable().optional(),
  mode: AnswerMode,
  kid_answer: z.string().nullable(),
  parsed_kid_latex: z.string().nullable().optional(),
  duration_ms: z.number().int().nullable().optional(),
  prior_hints: z.array(z.string()).default([]),
  test_mode: z.boolean().default(false),
});
export type AttemptCreate = z.infer<typeof AttemptCreate>;

export const AttemptBatchEntry = z.object({
  client_id: Uuid,
  item_id: Uuid,
  session_id: Uuid.nullable().optional(),
  mode: AnswerMode,
  kid_answer: z.string().nullable(),
  verdict: Verdict,
  evaluated_by: EvaluatedBy,
  hints_used: z.number().int().nonnegative().default(0),
  duration_ms: z.number().int().nullable().optional(),
  test_mode: z.boolean().default(false),
  created_at: Iso8601,
});
export type AttemptBatchEntry = z.infer<typeof AttemptBatchEntry>;

export const AttemptBatchRequest = z.object({
  attempts: z.array(AttemptBatchEntry).min(1),
});
export type AttemptBatchRequest = z.infer<typeof AttemptBatchRequest>;

// SSE event envelope from POST /attempts.
export const AttemptSseEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('verdict'), verdict: Verdict }),
  z.object({ type: z.literal('feedback'), text: z.string() }),
  z.object({ type: z.literal('next_hint'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    credits_used: z.number().int().nonnegative(),
    attempt_id: Uuid,
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type AttemptSseEvent = z.infer<typeof AttemptSseEvent>;
