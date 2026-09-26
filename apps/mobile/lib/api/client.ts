// Transport to the API: bearer token (refreshed when needed), the device's
// time zone (Buddy's timing depends on it), the adult's admin token when
// present, and the error envelope as ApiError. Responses are validated with
// the shared zod contracts.

import type { z, ZodTypeAny } from 'zod';

import { adminToken } from '../admin.js';
import { currentSession, type Session } from '../auth/session.js';
import { refreshSession } from '../auth/supabase.js';
import { ENV } from '../env.js';
import { deviceTimeZone } from '../time.js';
import { SseReader, type SseEvent } from './sse.js';
import { streamingFetch } from './streamingFetch.js';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The more specific reason the API gives (e.g. "photos_missing"), if any. */
  get reason(): string | null {
    const r = this.details?.reason;
    return typeof r === 'string' ? r : null;
  }
}

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

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** One authorised call; a 401 refreshes the session once and tries again. */
async function authorised(
  method: Method,
  path: string,
  body: unknown,
  accept: string,
  fetchFn: FetchLike = fetch,
): Promise<Response> {
  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = { accept, 'x-timezone': deviceTimeZone() };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const admin = adminToken();
    if (admin) headers['x-admin-token'] = admin;
    try {
      return await fetchFn(`${ENV.API_URL}/v1${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('network', 'No connection', 0);
    }
  };
  let res = await send(await validToken());
  if (res.status === 401 && currentSession()) {
    const next = await refreshOnce();
    if (next) res = await send(next.access_token);
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
 * A call whose answer streams as server-sent events (docs/architecture.md §Speed):
 * every event but the last goes to onEvent; the `done` event is the result
 * (validated like request()), an `error` event throws. A server that answers
 * with plain JSON (an error before streaming, or no streaming) is read as request() would.
 */
export async function streamRequest<S extends ZodTypeAny>(
  method: Method,
  path: string,
  opts: { body?: unknown; schema: S; onEvent: (event: SseEvent) => void },
): Promise<z.infer<S>> {
  // expo/fetch streams the body on the phone as well (React Native's fetch does not).
  const res = await authorised(method, path, opts.body, 'text/event-stream', streamingFetch);
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
      throw new ApiError('network', 'Connection lost', 0);
    }
    if (chunk.done) break;
    for (const e of sse.push(decoder.decode(chunk.value, { stream: true }))) {
      if (e.event === 'done') {
        void reader.cancel().catch(() => undefined);
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
  throw new ApiError('network', 'Connection lost', 0);
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
