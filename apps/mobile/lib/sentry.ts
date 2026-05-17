// Sentry init wrapper. Doc 02 §observability.
//
// init() is idempotent and safe to call multiple times — the underlying SDK
// is a no-op when DSN is empty, which keeps unit tests + dev builds free of
// real network calls. Crash reports are scoped to the EU region by setting
// the DSN's ingest path; we don't transmit IP addresses.

import * as Sentry from '@sentry/react-native';

import { ENV } from './env.js';

let inited = false;

export function initSentry(): void {
  if (inited) return;
  inited = true;
  if (!ENV.SENTRY_DSN) {
    // No DSN = no telemetry. Returning here keeps Sentry.* calls inert.
    return;
  }
  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    release: ENV.RELEASE,
    // Sentry's default sample rate is 1.0 in dev, which is fine for early
    // beta. Tune via env once volume becomes a concern.
    tracesSampleRate: 0.1,
    // We capture only opted-in PII (the learner's display name is not
    // personally identifying for our use case; emails are not sent).
    sendDefaultPii: false,
    // Reduce noise from RN dev errors.
    enableNativeCrashHandling: true,
  });
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!ENV.SENTRY_DSN) {
    // Surface to the console in development so we don't lose the trail.
    console.error('[mobile] error (Sentry not configured)', err, context);
    return;
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function setSentryUser(userId: string | null, accountId: string | null): void {
  if (!ENV.SENTRY_DSN) return;
  if (!userId) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: userId, segment: accountId ?? undefined });
}
