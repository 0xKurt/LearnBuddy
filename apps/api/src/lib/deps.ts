// Dependency injection seam.
//
// Routes read their deps from `c.get('deps')` instead of importing concrete
// modules. The app factory wires the production deps; tests pass fakes.
//
// This is the boundary that keeps route handlers testable without `vi.mock`
// gymnastics. Add a new external system here, not in route files.

import type { Context } from 'hono';

import type { Env } from './env.js';
import type { AnonClient, ServiceClient } from './supabase.js';
import { createAnonClient, createServiceClient } from './supabase.js';
import { loadEnv } from './env.js';

export type Deps = {
  env: Env;
  /** Service-role Supabase client. Bypasses RLS — only call after auth is enforced. */
  supabase: ServiceClient;
  /** Anon Supabase client. Used for JWT verification and unauthenticated signup. */
  supabaseAnon: AnonClient;
  /** Override the current time. Defaults to `Date.now()` in prod, fixed value in tests. */
  now: () => Date;
  /** Generate a UUID v4. Indirection lets tests assert deterministic outputs. */
  uuid: () => string;
};

declare module 'hono' {
  interface ContextVariableMap {
    deps: Deps;
  }
}

export function getDeps(c: Context): Deps {
  const d = c.get('deps');
  if (!d) {
    throw new Error('deps not installed — did createApp() forget to mount the deps middleware?');
  }
  return d;
}

export function createProdDeps(): Deps {
  const env = loadEnv();
  return {
    env,
    supabase: createServiceClient(env),
    supabaseAnon: createAnonClient(env),
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
  };
}
