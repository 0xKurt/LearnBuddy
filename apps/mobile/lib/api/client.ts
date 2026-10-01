// Transport to the API: bearer token (refreshed when needed), the device's
// time zone (Buddy's timing depends on it), the adult's admin token when
// present, and the error envelope as ApiError. Responses are validated with
// the shared zod contracts.

import type { AppRequestHeader } from '@learnbuddy/shared-types/contracts';
import Constants from 'expo-constants';
import type { z, ZodTypeAny } from 'zod';

import { adminToken } from '../admin.js';
import { currentSession, type Session } from '../auth/session.js';
import { refreshSession } from '../auth/supabase.js';
import { ENV } from '../env.js';
import { deviceTimeZone } from '../time.js';
import { ApiError } from './apiError.js';
import { SseReader, type SseEvent } from './sse.js';
import { streamingFetch } from './streamingFetch.js';

// Lives in lib/api/apiError.ts (free of Expo modules, so the code that decides
// what a failure means is testable under Node); this stays its usual address.
export { ApiError } from './apiError.js';

let refreshing: Promise<Session | null> | null = null;

function refreshOnce(): Promise<Session | null> {
  const s = currentSession();
  if (!s) return Promise.resolve(null);
  refreshing ??= refreshSession(s.refresh_token).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function validToken(): Promise<string | null> {
  const s = currentSession();
  if (!s) return null;
  // Refresh a minute before expiry instead of waiting for a 401.
  if (s.expires_at * 1000 - Date.now() < 60_000) {
    const next = await refreshOnce();
    return next?.access_token ?? currentSession()?.access_token ?? null;
  }
  return s.access_token;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** This build's version: the API answers `update_required` when it is too old (audit M-69). */
const APP_VERSION = Constants.expoConfig?.version ?? null;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One authorised call; a 401 refreshes the session once and tries again. */
async function authorised(
  method: Method,
  path: string,
  body: unknown,
  accept: string,
  fetchFn: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<Response> {
  const send = async (token: string | null): Promise<Response> => {
    // Only listed headers: anything else fails the browser's CORS preflight.
    const headers: { [H in AppRequestHeader]?: string } = {
      accept,
      'x-timezone': deviceTimeZone(),
    };
    if (APP_VERSION) headers['x-app-version'] = APP_VERSION;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const admin = adminToken();
    if (admin) headers['x-admin-token'] = admin;
    try {
      return await fetchFn(`${ENV.API_URL}/v1${path}`, {
        method,
        headers: headers as Record<string, string>,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        ...(signal ? { signal } : {}),
      });
    } catch {
      if (signal?.aborted) throw aborted();
      throw new ApiError('network', 'No connection', 0);
    }
  };
  let res = await send(await validToken());
  if (res.status === 401 && currentSession()) {
    const next = await refreshOnce();
    if (next) res = await send(next.access_token);
    // Still signed in but no new token: the sign-in service could not answer
    // (outage, rate limit). Not "sign in again" — try later (audit H-28).
    else if (currentSession())
      throw new ApiError('unavailable', 'Sign-in service unreachable', 503);
  }
  return res;
}

export async function request<S extends ZodTypeAny>(
  method: Method,
  path: string,
  opts: { body?: unknown; schema: S },
): Promise<z.infer<S>>;
export async function request(
  method: Method,
  path: string,
  opts?: { body?: unknown },
): Promise<unknown>;
export async function request<S extends ZodTypeAny>(
  method: Method,
  path: string,
  opts: { body?: unknown; schema?: S } = {},
): Promise<unknown> {
  const res = await authorised(method, path, opts.body, 'application/json');
  return readJson(res, method, path, opts.schema);
}

async function readJson<S extends ZodTypeAny>(
  res: Response,
  method: Method,
  path: string,
  schema: S | undefined,
): Promise<unknown> {
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(
        'invalid_response',
        'The server answered with something unexpected',
        res.status,
      );
    }
  }
  if (!res.ok) {
    const err = (
      json as {
        error?: { code?: string; message?: string; details?: Record<string, unknown> };
      } | null
    )?.error;
    throw new ApiError(
      err?.code ?? 'internal',
      err?.message ?? `HTTP ${res.status}`,
      res.status,
      err?.details ?? null,
    );
  }
  if (!schema) return json;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('invalid_response', `Unexpected response for ${method} ${path}`, res.status);
  }
  return parsed.data;
}

/**
 * Lets go of a response body this call is finished with — deliberately *not* `reader.cancel()`.
 *
 * Cancelling closes the body's stream on this side. expo's own `didComplete` listener then
 * calls `close()` on the same controller a second time without checking whether it still may
 * (`expo/src/winter/fetch/FetchResponse.ts`, `get body()`: it keeps an `isControllerClosed`
 * flag for exactly this and reads it in every branch except that one), and the second close
 * throws `TypeError: The stream is not in a state that permits close` from inside a native
 * event callback — with none of this file's `try`/`catch` or `.catch()` on the stack. It
 * escapes to the engine's own handler, and a child read the English sentence on her screen
 * (issue #183, after leaving the conversation while a reply was still streaming).
 *
 * There is nothing to cancel anyway: after the `done` event the server has already closed the
 * response (`apps/api/src/modules/buddy/routes.ts`, `streamSSE`), and a call ended on this
 * side was ended natively by the AbortSignal, which expo subscribes to itself. Releasing the
 * lock leaves the stream readable, so expo's close is the first and only one.
 *
 * And this failure gets no message at all, on purpose: walking out of a conversation while
 * Buddy is still speaking is not something the learner did wrong, and nothing is lost by it.
 */
function letGo(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    reader.releaseLock();
  } catch {
    // A reader with a read still in flight cannot be released; the body goes with the
    // response either way.
  }
}

/**
 * A call whose answer streams as server-sent events (docs/architecture.md §Speed):
 * every event but the last goes to onEvent; the `done` event is the result
 * (validated like request()), an `error` event throws. A server that answers
 * with plain JSON (an error before streaming, or no streaming) is read as request() would.
 */
export async function streamRequest<S extends ZodTypeAny>(
  method: Method,
  path: string,
  opts: {
    body?: unknown;
    schema: S;
    onEvent: (event: SseEvent) => void;
    /** Ends the stream on this side ("Stopp"): the call throws `aborted`. */
    signal?: AbortSignal;
  },
): Promise<z.infer<S>> {
  // expo/fetch streams the body on the phone as well (React Native's fetch does not).
  const res = await authorised(
    method,
    path,
    opts.body,
    'text/event-stream',
    streamingFetch,
    opts.signal,
  );
  const reader =
    (res.headers.get('content-type') ?? '').includes('text/event-stream') && res.body
      ? res.body.getReader()
      : null;
  if (!reader) return readJson(res, method, path, opts.schema) as Promise<z.infer<S>>;
  const sse = new SseReader();
  const decoder = new TextDecoder();
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch {
      if (opts.signal?.aborted) throw aborted();
      throw streamLost();
    }
    if (opts.signal?.aborted) {
      letGo(reader);
      throw aborted();
    }
    if (chunk.done) break;
    for (const e of sse.push(decoder.decode(chunk.value, { stream: true }))) {
      if (e.event === 'done') {
        letGo(reader);
        const parsed = opts.schema.safeParse(safeJson(e.data));
        if (!parsed.success)
          throw new ApiError('invalid_response', `Unexpected response for ${method} ${path}`, 200);
        return parsed.data;
      }
      if (e.event === 'error') {
        const code = (safeJson(e.data) as { code?: string } | null)?.code ?? 'internal';
        throw new ApiError(code, 'The server could not finish', 500);
      }
      opts.onEvent(e);
    }
  }
  // The stream ended without a result: the message may have arrived; the caller reloads.
  throw streamLost();
}

/**
 * The connection broke after the request went out: the server may have the message and
 * go on with it, so not "check your internet" (p2-J-sse-drop-copy). Still a network
 * error for everything that decides by code.
 */
function streamLost(): ApiError {
  return new ApiError('network', 'Connection lost', 0, { reason: 'stream_lost' });
}

/** She ended the call herself (the stream was stopped on this side): nothing to report. */
function aborted(): ApiError {
  return new ApiError('aborted', 'Stopped', 0);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function newId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 from Math.random as a fallback (older runtimes); only used for idempotency keys.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
