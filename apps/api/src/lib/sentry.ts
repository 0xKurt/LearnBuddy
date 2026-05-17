// Sentry init wrapper for the API. Doc 02 §observability.
//
// init() is idempotent — first call wins, subsequent calls are no-ops. We
// only init when SENTRY_DSN is set so unit tests + local dev don't ship
// telemetry.
//
// `captureApiError(err)` is the only export the rest of the code uses;
// the error middleware in `middleware/error.ts` calls it for any non-
// `ApiError` exception (i.e. unexpected internals — the ones we want
// alerted on).

import * as Sentry from '@sentry/node';

let inited = false;

export function initSentry(): void {
  if (inited) return;
  inited = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? 'dev',
    tracesSampleRate: 0.05,
    // Vercel cold starts run init() on every cold instance. The SDK is
    // safe to re-init but we still gate with `inited` for ergonomics.
    sendDefaultPii: false,
  });
}

export function captureApiError(err: unknown, extra?: Record<string, unknown>): void {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(err, extra ? { extra } : undefined);
}
