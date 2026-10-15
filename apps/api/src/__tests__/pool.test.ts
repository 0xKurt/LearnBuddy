// The database pool keeps an idle connection a minute and is handed to the host's lifecycle
// (#671 F14-e). With ten idle seconds a warm instance opened a new TLS connection to the pooler
// for nearly every tap of hers; on Vercel `attachDatabasePool` closes the idle ones before the
// instance is suspended. Pure: the pool connects lazily, nothing reaches a database here.

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import type { PgDb } from '../lib/db.js';
import { productionDeps } from '../production.js';

const config = loadConfig({
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'unused-unused-unused',
  ADMIN_TOKEN_SECRET: 'unused-unused-unused-unused-unused!',
  LLM_BACKEND: 'disabled',
  SPEECH_BACKEND: 'disabled',
  DATABASE_URL: 'postgres://postgres:pw@127.0.0.1:5432/postgres',
});

describe('the production database pool', () => {
  it('keeps idle connections a minute and hands the pool to the host', async () => {
    const attached: PgDb['pool'][] = [];
    const deps = productionDeps(
      config,
      () => undefined,
      (pool) => attached.push(pool),
    );
    expect(attached).toHaveLength(1);
    expect(attached[0]!.options.idleTimeoutMillis).toBe(60_000);
    await (deps.db as PgDb).close();
  });
});
