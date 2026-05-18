// Conversational session API. Doc 04 §sessions + Doc 06 §P3.
//
// The turn endpoint streams Server-Sent Events; React Native's stock fetch
// can't read a streaming body, so we use `expo/fetch` (Expo SDK 52+) whose
// Response exposes a real ReadableStream. Everything else (snapshot, patch)
// goes through the normal typed `api()` client.

import { fetch as streamingFetch } from 'expo/fetch';
import {
  ConversationSseEvent,
  SessionSnapshot,
  type ConversationSseEvent as ConversationSseEventT,
} from '@learnbuddy/shared-types';

import { getSessionSync } from '../auth/session.js';
import { ENV } from '../env.js';
import { ApiError, api } from './client.js';

export type TurnInput = {
  client_turn_id: string;
  item_id: string;
  mode: 'voice' | 'text' | 'multiple_choice';
  text?: string | null;
  audio_base64?: string | null;
  audio_mime?: 'audio/m4a' | 'audio/mp4' | 'audio/wav' | 'audio/webm' | null;
  duration_ms?: number;
  test_mode?: boolean;
  client_local_verdict?: 'correct' | null;
};

/**
 * Stream one conversational turn. `onEvent` fires for every SSE event
 * (transcript / token / verdict / feedback / done / error). Resolves when
 * the stream closes. Throws ApiError on a non-streaming failure (auth,
 * validation) so the caller can surface a calm retry.
 */
export async function streamTurn(
  learnerId: string,
  sessionId: string,
  input: TurnInput,
  onEvent: (e: ConversationSseEventT) => void,
): Promise<void> {
  const session = getSessionSync();
  const url = new URL(`/sessions/${sessionId}/turn`, ENV.API_URL).toString();
  const res = await streamingFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(session ? { authorization: `Bearer ${session.access_token}` } : {}),
      'x-learner-id': learnerId,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let code = 'unknown';
    let message = `Request failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body — keep defaults */
    }
    throw new ApiError(code, message, res.status);
  }

  const body = res.body;
  if (!body) throw new ApiError('stream_unavailable', 'No response stream', res.status);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        try {
          const parsed = ConversationSseEvent.safeParse(JSON.parse(json));
          if (parsed.success) onEvent(parsed.data);
        } catch {
          /* skip a malformed frame rather than abort the whole turn */
        }
      }
    }
  }
}

export async function getSessionSnapshot(
  learnerId: string,
  sessionId: string,
): Promise<SessionSnapshot> {
  return api(`/sessions/${sessionId}`, {
    method: 'GET',
    schema: SessionSnapshot,
    learnerId,
  });
}

export async function patchSession(
  learnerId: string,
  sessionId: string,
  body: { pinned_topic?: string | null; keep_going?: boolean },
): Promise<SessionSnapshot> {
  return api(`/sessions/${sessionId}`, {
    method: 'PATCH',
    body,
    schema: SessionSnapshot,
    learnerId,
  });
}
