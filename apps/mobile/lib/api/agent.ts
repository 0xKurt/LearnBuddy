// Agent v2 API client.
//
// One create call (`POST /agent/sessions`) returns the queue + opener.
// Every learner message hits `POST /agent/sessions/:id/turn` and reads
// back an SSE stream of `{type, ...}` events. The stream is JSON-line
// per spec — same shape used by the rest of the LearnBuddy SSE surface.

import { fetch as streamingFetch } from 'expo/fetch';
import { z } from 'zod';

import { getSessionSync } from '../auth/session';
import { ENV } from '../env';
import { ApiError, refreshAuthToken } from './client';

// ── Schemas ────────────────────────────────────────────────────────────────

const AgentSessionItem = z.object({
  id: z.string().uuid(),
  question: z.string(),
  expected_answer: z.string(),
  answer_kind: z.string(),
  topic: z.string().nullable().optional(),
  difficulty: z.number().nullable().optional(),
  mc_options: z.array(z.string()).nullable().optional(),
  units: z.string().nullable().optional(),
});
export type AgentSessionItem = z.infer<typeof AgentSessionItem>;

export const AgentSessionStart = z.object({
  session_id: z.string().uuid(),
  items: z.array(AgentSessionItem),
  opener: z.string(),
  first_question: z.string(),
});
export type AgentSessionStart = z.infer<typeof AgentSessionStart>;

const AgentSseFrame = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transcript'), text: z.string() }),
  z.object({ type: z.literal('reply'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    verdict: z.enum(['correct', 'partially_correct', 'incorrect', 'skipped']).nullable(),
    advance: z.boolean(),
    reveal: z.boolean().optional(),
    hint_given: z.boolean(),
    intent: z.string().optional(),
    learner_turn_id: z.string().nullable().optional(),
    tutor_turn_id: z.string().nullable().optional(),
    credits_used: z.number().int().nonnegative().optional(),
    replayed: z.boolean().optional(),
    session_complete: z.boolean().optional(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type AgentSseFrame = z.infer<typeof AgentSseFrame>;

// ── Calls ──────────────────────────────────────────────────────────────────

export async function createAgentSession(
  learnerId: string,
  input: {
    subject_id?: string | null;
    folder_id?: string | null;
    material_id?: string | null;
    test_mode?: boolean;
    max_items?: number;
  },
): Promise<AgentSessionStart> {
  const url = new URL('/agent/sessions', ENV.API_URL).toString();
  const tok = getSessionSync()?.access_token;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      'x-learner-id': learnerId,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      body.error?.code ?? 'internal',
      body.error?.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  const parsed = AgentSessionStart.safeParse(await res.json());
  if (!parsed.success) throw new ApiError('schema_mismatch', parsed.error.message, 500);
  return parsed.data;
}

export async function streamAgentTurn(
  learnerId: string,
  sessionId: string,
  input: {
    client_turn_id: string;
    text?: string | null;
    audio_base64?: string | null;
    audio_mime?: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm' | null;
  },
  onEvent: (frame: AgentSseFrame) => void,
): Promise<void> {
  const url = new URL(`/agent/sessions/${sessionId}/turn`, ENV.API_URL).toString();
  const doFetch = (token: string | null | undefined) =>
    streamingFetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-learner-id': learnerId,
      },
      body: JSON.stringify(input),
    });
  let res = await doFetch(getSessionSync()?.access_token);
  if (res.status === 401) {
    const fresh = await refreshAuthToken();
    if (fresh) res = await doFetch(fresh);
    else throw new ApiError('unauthenticated', 'Session expired', 401);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    throw new ApiError(
      body.error?.code ?? 'evaluation_failed',
      body.error?.message ?? `HTTP ${res.status}`,
      res.status,
    );
  }
  const body = res.body;
  if (!body) throw new ApiError('stream_unavailable', 'No response stream', res.status);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const emit = (json: string) => {
    try {
      const parsed = AgentSseFrame.safeParse(JSON.parse(json));
      if (parsed.success) onEvent(parsed.data);
    } catch {
      // ignore — single malformed frame must not kill the stream
    }
  };
  // SSE frames are separated by \n\n; payloads come as `data: <json>` lines.
  const flushFrames = (chunk: string): string => {
    let rest = chunk;
    let end: number;
    while ((end = rest.indexOf('\n\n')) !== -1) {
      const frame = rest.slice(0, end);
      rest = rest.slice(end + 2);
      const payload = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim())
        .join('');
      if (payload) emit(payload);
    }
    return rest;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    buf = flushFrames(buf);
  }
  // Final flush (some servers close without trailing blank line).
  if (buf.trim()) {
    const payload = buf
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
      .join('');
    if (payload) emit(payload);
  }
}

export async function finishAgentSession(learnerId: string, sessionId: string): Promise<void> {
  const url = new URL(`/agent/sessions/${sessionId}/finish`, ENV.API_URL).toString();
  const tok = getSessionSync()?.access_token;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      ...(tok ? { authorization: `Bearer ${tok}` } : {}),
      'x-learner-id': learnerId,
    },
  });
}
