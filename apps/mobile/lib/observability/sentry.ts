// Crash reports — off unless the owner configured an EU DSN (issue #36).
//
// This is configuration, not a half-built feature: without `EXPO_PUBLIC_SENTRY_DSN` the
// SDK is never started and nothing is sent; with it, reports go to Sentry's EU ingest and
// nowhere else (the DSN host is checked while `lib/env.ts` loads, so a build pointed at
// another region refuses to start). What may leave the phone is decided in `scrub.ts`.
//
// The browser gets `sentry.web.ts`: the walkthrough runs against a real API but has no
// native crash handler, and a missing export there has crashed a screen before
// (lib/speech/recognize.web.ts).

import * as Sentry from '@sentry/react-native';

import { ENV } from '../env.js';
import { scrubBreadcrumb, scrubEvent } from './scrub.js';

declare const __DEV__: boolean;

let started = false;

/**
 * Starts crash reporting if a DSN is configured. Called once, before the first render, so
 * a crash while the app is still starting is reported too. Calling it again does nothing.
 */
export function startCrashReports(): void {
  if (started || !ENV.SENTRY_DSN) return;
  started = true;
  Sentry.init({
    dsn: ENV.SENTRY_DSN,
    // Never the automatic personal data (id, e-mail, IP, request bodies).
    sendDefaultPii: false,
    // A screenshot or a view hierarchy of this app *is* the conversation. Both default to
    // false; they are named here so a future default cannot turn them on unnoticed.
    attachScreenshot: false,
    attachViewHierarchy: false,
    attachStacktrace: true,
    // Performance tracing would collect URLs and timings of every request, and failed
    // requests would carry their responses. Neither helps with a crash.
    enableAutoPerformanceTracing: false,
    enableCaptureFailedRequests: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    environment: __DEV__ ? 'development' : 'production',
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    beforeSend: (event) => scrubEvent(event),
  });
}

/**
 * Reports an error the app caught itself (the render boundary). Silent when crash reports
 * are off — the caller's own handling (the calm screen, the way back) is unaffected.
 */
export function reportCrash(error: unknown, where: string): void {
  if (!started) return;
  Sentry.captureException(error, { tags: { where } });
}
