// Foreign keys from the generic core's tables into the learning domain's (issue #107, cut 9). A
// core table may point at a domain table — her goal at its subject, her message at its sheet —
// but such a constraint belongs to the domain: it is named `domain_…`, so a Buddy without the
// learning domain (`create-buddy`, cut 10) leaves exactly these out of its core schema. Read from
// the real catalog of the migrated database, not from the migration texts: what counts is what
// production has. Behaviour stays as it was: same columns, same ON DELETE.
// requires live verification in Claude Code session (needs a running Postgres)
// @buddy-kit domain — the core's foreign keys into the domain: a core copy has none.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { testDatabaseAvailable } from '../testing/database.js';
import { createTestEnv, type TestEnv } from '../testing/harness.js';

const dbReady = await testDatabaseAvailable();

const config = '../../../../tools/guards/boundaries.config.mjs';
const { DOMAIN_TABLES } = (await import(config)) as { DOMAIN_TABLES: string[] };

type Fk = { name: string; table: string; columns: string; target: string; on_delete: string };

describe.skipIf(!dbReady)('foreign keys from the core into the domain (#107, cut 9)', () => {
  let env: TestEnv;
  beforeAll(async () => {
    env = await createTestEnv();
  });
  afterAll(async () => {
    await env?.close();
  });

  const intoDomain = () =>
    env.db.query<Fk>(
      `select c.conname as name, c.conrelid::regclass::text as "table",
              (select string_agg(a.attname, ',' order by a.attnum) from pg_attribute a
                where a.attrelid = c.conrelid and a.attnum = any(c.conkey)) as columns,
              c.confrelid::regclass::text as target,
              case c.confdeltype when 'c' then 'cascade' when 'n' then 'set null'
                   when 'r' then 'restrict' when 'a' then 'no action' else 'set default' end as on_delete
         from pg_constraint c
        where c.contype = 'f'
          and c.confrelid::regclass::text = any($1::text[])
          and not (c.conrelid::regclass::text = any($1::text[]))
        order by 2, 3`,
      [DOMAIN_TABLES],
    );

  it("names every one as the domain's", async () => {
    const fks = await intoDomain();
    expect(fks.filter((f) => !f.name.startsWith('domain_')).map((f) => f.name)).toEqual([]);
  });

  it('keeps every one exactly as it was: the same columns, the same target, the same ON DELETE', async () => {
    expect((await intoDomain()).map(({ name: _name, ...fk }) => fk)).toEqual([
      { table: 'buddy_focus', columns: 'material_id', target: 'materials', on_delete: 'set null' },
      { table: 'buddy_focus', columns: 'subject_id', target: 'subjects', on_delete: 'set null' },
      { table: 'buddy_goals', columns: 'subject_id', target: 'subjects', on_delete: 'set null' },
      {
        table: 'buddy_lookbacks',
        columns: 'subject_id',
        target: 'subjects',
        on_delete: 'set null',
      },
      {
        table: 'buddy_messages',
        columns: 'material_id',
        target: 'materials',
        on_delete: 'cascade',
      },
      {
        table: 'buddy_messages',
        columns: 'rehearsal_id',
        target: 'rehearsals',
        on_delete: 'set null',
      },
      {
        table: 'buddy_messages',
        columns: 'roleplay_id',
        target: 'buddy_roleplays',
        on_delete: 'set null',
      },
      { table: 'buddy_pending_actions', columns: 'item_id', target: 'items', on_delete: 'cascade' },
      {
        table: 'buddy_pending_actions',
        columns: 'material_id',
        target: 'materials',
        on_delete: 'cascade',
      },
    ]);
  });

  it('leaves every one validated', async () => {
    const open = await env.db.query<{ conname: string }>(
      `select conname from pg_constraint where contype = 'f' and not convalidated`,
    );
    expect(open).toEqual([]);
  });
});
