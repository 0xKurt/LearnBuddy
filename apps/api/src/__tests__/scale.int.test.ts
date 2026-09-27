// Cost that grows with her data, not everybody's (audit M-68
// p2-account-deletion-cascade-unindexed-fks, p2-state-subjects-counts-scan-all-tenants;
// migration 0019_learner_indexes.sql).
// requires live verification in Claude Code session (needs a running Postgres)

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, onboard, type Learner, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

type PlanNode = { 'Node Type': string; 'Relation Name'?: string; Plans?: PlanNode[] };

function scans(node: PlanNode, out: string[] = []): string[] {
  if (node['Relation Name']) out.push(`${node['Node Type']} ${node['Relation Name']}`);
  for (const p of node.Plans ?? []) scans(p, out);
  return out;
}

describe.skipIf(!dbReady)('scale', () => {
  let env: TestEnv;
  let lena: Learner;
  let other: Learner;
  beforeAll(async () => {
    env = await createTestEnv();
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
    other = await onboard(env, { relation: 'child', name: 'Tom', birthDate: '2013-05-01' });
  });
  afterAll(async () => {
    await env?.close();
  });

  it('every foreign key has an index (the deletion cascade never scans whole tables)', async () => {
    const missing = await env.db.query<{ fk: string }>(
      `select c.conrelid::regclass || '.' || a.attname as fk
         from pg_constraint c
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        where c.contype = 'f' and c.connamespace = 'public'::regnamespace
          and not exists (
            select 1 from pg_index i
             where i.indrelid = c.conrelid
               and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey)
        order by 1`,
    );
    expect(missing.map((r) => r.fk)).toEqual([]);
  });

  it('counts her subjects’ questions through the index, not across all learners', async () => {
    // Someone else's large library, and a little of her own.
    await env.db.query(
      `with s as (insert into subjects (learner_id, name, kind)
                  select $1, 'Fach ' || n, 'math' from generate_series(1, 40) n returning id)
       insert into items (learner_id, subject_id, origin, kind, prompt, answer, topic)
       select $1, s.id, 'typed', 'short', 'Frage', 'Antwort', 'Thema'
         from s, generate_series(1, 500)`,
      [other.learnerId],
    );
    await env.db.query(
      `insert into materials (learner_id, client_request_id, subject_id, status, photo_count, title, created_at)
       select $1, gen_random_uuid(), s.id, 'ready', 1, 'Blatt', $2
         from subjects s, generate_series(1, 100) where s.learner_id = $1`,
      [other.learnerId, env.clock.now()],
    );
    await env.db.query(
      `with s as (insert into subjects (learner_id, name, kind) values ($1, 'Mathe', 'math') returning id)
       insert into items (learner_id, subject_id, origin, kind, prompt, answer, topic)
       select $1, s.id, 'typed', 'short', 'Frage', 'Antwort', 'Brüche' from s, generate_series(1, 5)`,
      [lena.learnerId],
    );
    await env.db.query('analyze items; analyze materials; analyze subjects');
    // The per-subject counts of Buddy's state (modules/buddy/state.ts loadBuddyState).
    const [row] = await env.db.query<{ 'QUERY PLAN': { Plan: PlanNode }[] }>(
      `explain (format json)
       select s.id, s.name, s.kind,
              (select count(*) from items i where i.subject_id = s.id and i.archived_at is null)::int as item_count,
              (select count(*) from materials m where m.subject_id = s.id and m.archived_at is null and m.merged_into is null)::int as material_count
         from subjects s
        where s.learner_id = $1 and s.archived_at is null
        order by s.created_at, s.seq
        limit 20`,
      [lena.learnerId],
    );
    const used = scans(row!['QUERY PLAN'][0]!.Plan);
    expect(used.some((s) => s.endsWith(' items'))).toBe(true);
    expect(used.filter((s) => s.startsWith('Seq Scan') && /items|materials/.test(s))).toEqual([]);
  });
});

describe.skipIf(!dbReady)('older app builds (M-69)', () => {
  let env: TestEnv;
  let lena: Learner;
  beforeAll(async () => {
    env = await createTestEnv({ config: { MIN_APP_VERSION: '1.4.0' } });
    lena = await onboard(env, { relation: 'child', name: 'Lena', birthDate: '2014-02-10' });
  });
  afterAll(async () => {
    await env?.close();
  });

  const me = (version: string | null) =>
    env.app.request('/v1/me', {
      headers: {
        authorization: `Bearer ${lena.token}`,
        ...(version ? { 'x-app-version': version } : {}),
      },
    });

  it('asks a build older than the minimum to update, and serves the rest', async () => {
    const old = await me('1.3.9');
    expect(old.status).toBe(426);
    expect(((await old.json()) as { error: { code: string } }).error.code).toBe('update_required');
    expect((await me('1.4.0')).status).toBe(200);
    expect((await me('1.10.0')).status).toBe(200);
    // No version (older builds, the web): served as before.
    expect((await me(null)).status).toBe(200);
  });
});
