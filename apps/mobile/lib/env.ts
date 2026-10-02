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
  /**
   * A build that is handed around internally and never reaches a store (issue #130).
   * Set ONLY in `eas.json` under `build.preview.env`, where `distribution` is `internal`.
   * It buys exactly one thing: the app starts without the two legal URLs — and says so on
   * the screen where they would have been. It buys nothing else, and `production` ignores it.
   */
  INTERNAL_BUILD: process.env.EXPO_PUBLIC_INTERNAL_BUILD === '1',
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
// An app that children use may not reach a store without its privacy notice and its imprint:
// `lib/about.ts` deliberately renders NOTHING rather than a placeholder, so a missing URL is
// invisible — the consent screen simply has no link to read, and settings › Über has no row.
// Invisible is exactly how it would ship. So a release build refuses to start without them,
// the same way it refuses without its API URL (issue #130). In Germany the imprint is required
// by law; the privacy notice is required by the consent the parents are giving on that very
// screen. The support address and the Sentry DSN stay optional: a missing support row is a
// worse app, not an unlawful one, and no crash reporting is a deliberate, documented state.
const missingLegal = (
  [
    ['EXPO_PUBLIC_PRIVACY_URL', ENV.PRIVACY_URL],
    ['EXPO_PUBLIC_IMPRINT_URL', ENV.IMPRINT_URL],
  ] as const
)
  .filter(([, value]) => !value)
  .map(([name]) => name);
//
// One exception, and it is narrow by construction: a build marked as INTERNAL may start
// without them. The reason the rule exists is that the app must not reach a STORE without
// its legal pages; an internal build (`distribution: internal` in eas.json) reaches no store.
// Refusing to start there would mean the owner cannot test his own app until a website
// exists — which is how a safety rule turns into a reason to switch it off entirely.
//
// What the exception does NOT do: hide the gap. `legalGap` below is true in exactly that
// case, and the consent screen says it in plain words. The whole point of issue #130 was
// that a missing link is INVISIBLE; an internal build that silently looked complete would
// reintroduce the bug the rule was written against.
if (release && !ENV.INTERNAL_BUILD && missingLegal.length > 0) {
  throw new Error(
    `Release build without ${missingLegal.join(', ')} — the consent screen would have no ` +
      `privacy link and settings no imprint (issue #130; set them in apps/mobile/eas.json ` +
      `under build.production.env, or as EAS environment variables). An internal test build ` +
      `may set EXPO_PUBLIC_INTERNAL_BUILD=1 instead; it then says so on the consent screen.`,
  );
}

/**
 * This build starts although its legal pages are missing (issue #130). The consent screen
 * renders a visible notice for it — never silently, because invisibility was the original bug.
 */
export const legalGap = ENV.INTERNAL_BUILD && missingLegal.length > 0;
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
