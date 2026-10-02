// Export and deletion cover every table that holds something about a person — checked against
// the database itself (information_schema), not against a list someone remembers to extend.
// docs/privacy.md §Export and deletion, docs/dpia.md §5 R9 (issue #32).
// requires live verification in Claude Code session (needs a running Postgres)
//
// Two directions, both from the catalogue:
// - deletion: every column that names a learner or an account is a foreign key to it with
//   ON DELETE CASCADE, so removing the auth user (the deletion's last stage) leaves nothing
//   behind even for a table the content stage does not list;
// - export: every such table appears in the export by name. A new migration with a
//   `learner_id` column fails here until the export says what it contains.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

/** Columns that name a person's row. */
const OWNER_COLUMNS = ['learner_id', 'account_id', 'auth_user_id'];

/**
 * Tables reached through a parent rather than an owner column, and the export key they appear
 * under. Without this list a table like `session_items` would be invisible to the check.
 */
const VIA_PARENT: Record<string, string> = {
  session_items: 'session_items',
  material_photos: 'material_photos',
};

/** A speech_cache key is a sha-256 hex digest (0040_natural_voice.sql). */
const KEY = 'a'.repeat(64);

/** The two person tables are exported as single objects, under these keys. */
const PERSON_TABLES: Record<string, string> = { accounts: 'account', learners: 'learner' };

describe.skipIf(!dbReady)('export and deletion completeness', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.close();
  });

  async function ownedTables(): Promise<Array<{ table: string; column: string }>> {
    return env.db.query<{ table: string; column: string }>(
      `select c.table_name as table, c.column_name as column
         from information_schema.columns c
         join information_schema.tables t
           on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
          and c.column_name = any($1::text[])
        order by 1, 2`,
      [OWNER_COLUMNS],
    );
  }

  it('finds the person tables at all (the check is not vacuous)', async () => {
    const tables = new Set((await ownedTables()).map((t) => t.table));
    for (const t of ['learners', 'buddy_messages', 'materials', 'attempt_counters']) {
      expect(tables.has(t)).toBe(true);
    }
  });

  it('every owner column cascades from the person, so the deletion leaves nothing', async () => {
    const fks = await env.db.query<{ table: string; column: string; rule: string }>(
      `select kcu.table_name as table, kcu.column_name as column, rc.delete_rule as rule
         from information_schema.referential_constraints rc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = rc.constraint_name
          and kcu.constraint_schema = rc.constraint_schema
        where kcu.table_schema = 'public' and kcu.column_name = any($1::text[])`,
      [OWNER_COLUMNS],
    );
    const cascading = new Set(
      fks.filter((f) => f.rule === 'CASCADE').map((f) => `${f.table}.${f.column}`),
    );
    const missing = (await ownedTables())
      .map((t) => `${t.table}.${t.column}`)
      .filter((key) => !cascading.has(key));
    expect(missing).toEqual([]);
  });

  it('every table that holds something about her is in her export', async () => {
    const l = await onboard(env);
    const out = await l.api.get<Record<string, unknown>>('/account/export');
    expect(out.status).toBe(200);
    const keys = new Set(Object.keys(out.body));
    const expected = [
      ...new Set((await ownedTables()).map((t) => PERSON_TABLES[t.table] ?? t.table)),
      ...Object.values(VIA_PARENT),
    ];
    expect(expected.filter((k) => !keys.has(k))).toEqual([]);
  });

  it('the parent-linked tables really hang off a person table', async () => {
    // If one of them gains its own owner column it belongs in the main check instead, and a
    // table that silently lost its parent would leave this list claiming coverage it lacks.
    const fks = await env.db.query<{ table: string; ref: string; rule: string }>(
      `select tc.table_name as table, ccu.table_name as ref, rc.delete_rule as rule
         from information_schema.table_constraints tc
         join information_schema.referential_constraints rc
           on rc.constraint_name = tc.constraint_name
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name
        where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
          and tc.table_name = any($1::text[])`,
      [Object.keys(VIA_PARENT)],
    );
    const owned = new Set((await ownedTables()).map((t) => t.table));
    for (const table of Object.keys(VIA_PARENT)) {
      const parents = fks.filter((f) => f.table === table && f.rule === 'CASCADE');
      expect(parents.some((p) => owned.has(p.ref))).toBe(true);
    }
  });

  it('exports the counters, the unclear spots and the voice cache without their payloads', async () => {
    const l = await onboard(env);
    const now = env.clock.now();
    const [m] = await env.db.query<{ id: string }>(
      `insert into materials (learner_id, client_request_id, photo_count, status, created_at)
       values ($1, gen_random_uuid(), 1, 'ready', $2) returning id`,
      [l.learnerId, now],
    );
    await env.db.query(
      `insert into material_unclear_spots
         (learner_id, material_id, sheet_id, ref, page, task, about, readings, asked_at, expires_at)
       values ($1, $2, $2, 'u1', 1, 'Aufgabe 3b', 'eine Ziffer', '["12","17"]', $3, $3)`,
      [l.learnerId, m!.id, now],
    );
    await env.db.query(
      `insert into speech_cache (learner_id, key, mime, audio, created_at, expires_at)
       values ($1, $2, 'audio/mpeg', '\\x00010203', $3, $3)`,
      [l.learnerId, KEY, now],
    );
    await env.db.query(
      `insert into attempt_counters (scope, account_id, window_start, count, updated_at)
       values ('pin', $1, $2, 2, $2)`,
      [l.accountId, now],
    );
    const out = await l.api.get<{
      material_unclear_spots: Array<{ task: string; readings: string[] }>;
      speech_cache: Array<Record<string, unknown>>;
      attempt_counters: Array<{ scope: string; count: number }>;
    }>('/account/export');
    expect(out.status).toBe(200);
    expect(out.body.material_unclear_spots).toMatchObject([
      { task: 'Aufgabe 3b', readings: ['12', '17'] },
    ]);
    expect(out.body.speech_cache).toHaveLength(1);
    expect(out.body.speech_cache[0]).toMatchObject({ key: KEY, bytes: 4 });
    expect(out.body.speech_cache[0]).not.toHaveProperty('audio');
    expect(out.body.attempt_counters).toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: 'pin', count: 2 })]),
    );

    // Another account's export never carries them.
    const other = await onboard(env);
    const theirs = await other.api.get<{
      material_unclear_spots: unknown[];
      speech_cache: unknown[];
      attempt_counters: unknown[];
    }>('/account/export');
    expect(theirs.body.material_unclear_spots).toEqual([]);
    expect(theirs.body.speech_cache).toEqual([]);
    expect(theirs.body.attempt_counters).not.toContainEqual(
      expect.objectContaining({ scope: 'pin', count: 2 }),
    );
  });
});
