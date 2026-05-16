// Typed API client. Doc 02 §api + doc 04 entire.
//
// Single entry point for all server requests. Attaches the bearer token from
// the in-memory session cache, normalizes errors into `ApiError`, and lets
// callers pass a zod schema to validate the response shape.
//
// Per-endpoint helpers live in `lib/api/auth.ts`, `lib/api/learners.ts`, etc.
// Those files own the URL + zod schema; this file owns transport.

import { z, type ZodTypeAny } from 'zod';

import { ENV } from '../env.js';
import { getSessionSync } from '../auth/session.js';

export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

type RequestOptions<S extends ZodTypeAny> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Zod schema for the success-path response. Required for typed returns. */
  schema?: S;
  /** Idempotency-Key header value (per doc 04 §Conventions). */
  idempotencyKey?: string;
  /** Override the access token (e.g. mid-signup before session is stored). */
  authOverride?: string | null;
};

export async function api<S extends ZodTypeAny>(
  path: string,
  opts: RequestOptions<S>,
): Promise<z.infer<S>>;
export async function api(path: string, opts?: RequestOptions<ZodTypeAny>): Promise<unknown>;
export async function api<S extends ZodTypeAny>(
  path: string,
  opts: RequestOptions<S> = {},
): Promise<unknown> {
  const url = new URL(path, ENV.API_URL).toString();
  const headers: Record<string, string> = { 'content-type': 'application/json' };

  const token =
    opts.authOverride !== undefined ? opts.authOverride : getSessionSync()?.access_token;
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (opts.idempotencyKey) {
    headers['idempotency-key'] = opts.idempotencyKey;
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const body = json as ApiErrorBody | undefined;
    throw new ApiError(
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? `Request failed: ${res.status}`,
      res.status,
      body?.error?.details,
    );
  }

  if (opts.schema) {
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(
        'response_validation_failed',
        `Response shape mismatch at ${path}`,
        res.status,
        parsed.error.issues,
      );
    }
    return parsed.data;
  }
  return json;
}

/** Generate a UUID-ish idempotency key suitable for retry-safe POSTs. */
export function newIdempotencyKey(): string {
  // crypto.randomUUID is available in Hermes RN runtime since RN 0.74.
  return globalThis.crypto?.randomUUID?.() ?? `idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
