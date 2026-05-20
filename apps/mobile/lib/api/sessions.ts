// Session-related API helpers. Most of the legacy quiz-style session
// surface (startSession, finishSession, the SessionStart schema) was
// removed when the chat agent became the only conversational tutor —
// see apps/mobile/lib/api/agent.ts for `createAgentSession`,
// `streamAgentTurn`, `finishAgentSession`.
//
// What remains here is read-only or read-only-ish:
//   - `getSessionSummary` for the result screen.
//   - `explainTopic` for the "Erklär mir das" modal.

import { z } from 'zod';

import { api } from './client.js';

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
