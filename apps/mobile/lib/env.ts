// Build-time configuration (EXPO_PUBLIC_* variables, see .env.example).

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
};

declare const __DEV__: boolean;
// A production build must never send tokens over plain HTTP across a network
// (http://localhost is only this machine: local walkthroughs).
const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(ENV.API_URL);
if (typeof __DEV__ !== 'undefined' && !__DEV__ && !ENV.API_URL.startsWith('https://') && !local) {
  throw new Error(
    `Production build requires an https:// EXPO_PUBLIC_API_URL (got "${ENV.API_URL}")`,
  );
}
