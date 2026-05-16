// Supabase client factories. Doc 02 §api + §supabase.
//
// Two clients are exposed:
//   • `serviceClient` — uses the service role key, bypasses RLS. Used for
//     privileged writes after authorization is established by `requireAuth`.
//   • `anonClient` — uses the anon key. Used for verifying user JWTs and
//     for the signup flow (which is itself unauthenticated).
//
// In tests, the entire surface is replaceable via `createDeps({ supabase })`
// — see `lib/deps.ts`. Tests should not import this file directly.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

export type ServiceClient = SupabaseClient;
export type AnonClient = SupabaseClient;

export function createServiceClient(env: Env): ServiceClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAnonClient(env: Env): AnonClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
