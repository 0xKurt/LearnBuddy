// CORS for browser builds of the app (docs/architecture.md §API). The allowed
// request headers are the app's own list (APP_REQUEST_HEADERS), so a header the
// client starts sending cannot be forgotten here: a browser drops every call
// whose preflight does not allow all of its headers, and the app only sees
// "no connection".

import { APP_REQUEST_HEADERS } from '@learnbuddy/shared-types/contracts';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';

const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

export function appCors(opts: {
  /** Whether a browser origin may call. */
  allowOrigin: (origin: string) => boolean;
  /** Headers of other clients on the same host (the dev stack's stand-in for Supabase Auth). */
  extraHeaders?: readonly string[];
  maxAge?: number;
}): MiddlewareHandler {
  return cors({
    origin: (origin) => (opts.allowOrigin(origin) ? origin : null),
    allowMethods: CORS_METHODS,
    allowHeaders: [...APP_REQUEST_HEADERS, ...(opts.extraHeaders ?? [])],
    maxAge: opts.maxAge ?? 86_400,
  });
}
