// Mobile env. Doc 02 §config.
//
// At build time these are read from `EXPO_PUBLIC_*` env vars (see `eas.json`).
// `EXPO_PUBLIC_*` is the Expo Router convention for build-time-replaced values
// available to the JS bundle.

export const ENV = {
  API_URL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:6001',
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  DSGVO_CONSENT_VERSION: process.env.EXPO_PUBLIC_DSGVO_CONSENT_VERSION ?? '2026-05-01',
  REVENUECAT_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? '',
  SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  POSTHOG_API_KEY: process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '',
  POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
  RELEASE: process.env.EXPO_PUBLIC_APP_RELEASE ?? 'dev',
};

// Fail fast on a misconfigured production build that would send traffic
// (and auth tokens) over cleartext HTTP. The localhost default is dev-only.
declare const __DEV__: boolean;
if (typeof __DEV__ !== 'undefined' && !__DEV__ && !ENV.API_URL.startsWith('https://')) {
  throw new Error(
    `Production build requires an https:// API_URL — got "${ENV.API_URL}". Set EXPO_PUBLIC_API_URL.`,
  );
}
