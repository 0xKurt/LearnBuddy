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
  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-timezone': deviceTimeZone(),
    };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const admin = adminToken();
    if (admin) headers['x-admin-token'] = admin;
    try {
      return await fetch(`${ENV.API_URL}/v1${path}`, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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
  if (!opts.schema) return json;
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('invalid_response', `Unexpected response for ${method} ${path}`, res.status);
  }
  return parsed.data;
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
