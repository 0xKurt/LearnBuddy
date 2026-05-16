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
};
