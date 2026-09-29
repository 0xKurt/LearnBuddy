// Build-time configuration (EXPO_PUBLIC_* variables, see .env.example).

import { assertEuIngest } from './observability/scrub.js';

export const ENV = {
  /** API base without version, e.g. https://api.learnbuddy.app */
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787',
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'anon-key-missing',
  /** Full privacy policy (web page); the consent screen links to it. */
  PRIVACY_URL: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  /** Imprint (Impressum, web page); settings › "Über LearnBuddy". Empty hides the row. */
  IMPRINT_URL: process.env.EXPO_PUBLIC_IMPRINT_URL ?? '',
  /** Support contact address; settings › "Über LearnBuddy". Empty hides the row. */
  SUPPORT_EMAIL: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
  /**
   * Sentry DSN for crash reports (issue #36). Empty — the default — keeps crash reporting
   * off entirely, like `PUSH_BACKEND=disabled` on the API side. Only Sentry's EU ingest is
   * accepted; see below and docs/privacy.md §Processors.
   */
  SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
};

declare const __DEV__: boolean;
const release = typeof __DEV__ !== 'undefined' && !__DEV__;
// A release build without its configuration would quietly talk to localhost and a fake
// key: it refuses to start instead (p2-uf-prod-build-silent-localhost-fallback).
const missing = (
  [
    ['EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL],
    ['EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY],
  ] as const
)
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (release && missing.length > 0) {
  throw new Error(`Release build without ${missing.join(', ')} (see apps/mobile/.env.example)`);
}
// A production build must never send tokens over plain HTTP across a network
// (http://localhost is only this machine: local walkthroughs).
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ENV.API_URL);
if (release && !ENV.API_URL.startsWith('https://') && !local) {
  throw new Error(
    `Production build requires an https:// EXPO_PUBLIC_API_URL (got "${ENV.API_URL}")`,
  );
}
// A crash report carries a stack trace and device data. It may only go to the EU region —
// a DSN pointing anywhere else stops the app here instead of quietly reporting abroad
// (the same stance as `EuLocation` in apps/api/src/config.ts). This check is not limited
// to release builds: there is no version of "outside the EU" that is acceptable.
if (ENV.SENTRY_DSN) assertEuIngest(ENV.SENTRY_DSN);
