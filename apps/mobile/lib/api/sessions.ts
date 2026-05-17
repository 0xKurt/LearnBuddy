// Session API helpers. Doc 04 §sessions + §attempts.

import { z } from 'zod';
import { Item } from '@learnbuddy/shared-types';

import { api, newIdempotencyKey } from './client.js';

export const SessionStart = z.object({
  session_id: z.string().uuid(),
  items: z.array(Item),
});
export type SessionStart = z.infer<typeof SessionStart>;

export async function startSession(
  learnerId: string,
  input: {
    subject_id?: string | null;
    folder_id?: string | null;
    material_id?: string | null;
    test_mode?: boolean;
    max_items?: number;
  },
): Promise<SessionStart> {
  return api('/sessions', {
    method: 'POST',
    body: input,
    schema: SessionStart,
    learnerId,
    idempotencyKey: newIdempotencyKey(),
  });
}

export async function finishSession(learnerId: string, sessionId: string): Promise<void> {
  await api(`/sessions/${sessionId}/finish`, { method: 'PATCH', learnerId });
}

const SessionSummary = z.object({
  session_id: z.string().uuid(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  attempts_count: z.number().int().nonnegative(),
  secure_now: z.number().int().nonnegative(),
  still_unsure: z.number().int().nonnegative(),
  total_duration_ms: z.number().int().nonnegative(),
  topics: z.array(
    z.object({
      name: z.string(),
      tone: z.enum(['secure', 'unsure']),
    }),
  ),
});
export type SessionSummary = z.infer<typeof SessionSummary>;

export async function getSessionSummary(
  learnerId: string,
  sessionId: string,
): Promise<SessionSummary> {
  return api(`/sessions/${sessionId}/summary`, {
    method: 'GET',
    schema: SessionSummary,
    learnerId,
  });
}

const AttemptResult = z.object({
  verdict: z.enum(['correct', 'partially_correct', 'incorrect']),
  feedback: z.string().nullable(),
  next_hint: z.string().nullable(),
  credits_used: z.number().int().nonnegative(),
});
export type AttemptResult = z.infer<typeof AttemptResult>;

export async function submitAttempt(
  learnerId: string,
  input: {
    session_id?: string;
    item_id: string;
    mode: 'voice' | 'text' | 'multiple_choice';
    kid_answer: string;
    parsed_learner_latex?: string | null;
    prior_hints_given: string[];
    duration_ms: number;
    test_mode: boolean;
    client_local_verdict: 'correct' | null;
  },
): Promise<AttemptResult> {
  return api('/attempts', {
    method: 'POST',
    body: input,
    schema: AttemptResult,
    learnerId,
  });
}

const ExplainResponse = z.object({
  text: z.string(),
  credits_used: z.number().int().nonnegative(),
});

export async function explainTopic(
  learnerId: string,
  topic: string,
  style: 'simpler' | 'step-by-step' | 'analogy',
  context?: string,
  item_id?: string,
): Promise<{ text: string; credits_used: number }> {
  return api('/explain', {
    method: 'POST',
    body: { topic, style, context, item_id },
    schema: ExplainResponse,
    learnerId,
  });
}
