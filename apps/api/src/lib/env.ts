// Typed env loader. Doc 02 §config.
//
// Fail-fast on missing required vars at boot. Tests inject overrides via
// `loadEnv({ ... })` rather than mutating `process.env`.

import { z } from 'zod';

export const Env = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  /** Used to build absolute deep-link URLs we send in emails. */
  PUBLIC_APP_URL: z.string().url().default('learnbuddy://'),
  /** Email confirmation redirect target — the universal/deep link the user lands on after tapping the email link. */
  EMAIL_REDIRECT_URL: z.string().url().default('learnbuddy://verify-email'),
  /** Current DSGVO consent version constant — bumped requires re-consent. */
  DSGVO_CONSENT_VERSION: z.string().default('2026-05-01'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(overrides?: Partial<Record<string, string>>): Env {
  const merged = { ...process.env, ...overrides };
  return Env.parse(merged);
}
