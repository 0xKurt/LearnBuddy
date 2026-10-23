// Both branches of migration 0054, on the real schema built by the migration harness (#862).
// requires live verification in Claude Code session (needs Postgres; CI also requires pgvector)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { materialEmbeddingsReady } from '../modules/materials/passages.js';
import { createDb, type PgDb } from '../lib/db.js';
import {
  createTestDatabase,
  testDatabaseAvailable,
  type TestDatabase,
} from '../testing/database.js';

const dbReady = await testDatabaseAvailable();

describe.skipIf(!dbReady)('0054 conditional vector DDL', () => {
  let database: TestDatabase;
  let db: PgDb;
  beforeAll(async () => {
    database = await createTestDatabase();
    db = createDb(database.url);
  });
  afterAll(async () => {
    await db?.close();
    await database?.drop();
  });

  it.skipIf(process.env.LB_REQUIRE_PGVECTOR !== '1')(
    'requires PG17 with vector in the vector CI job, never silently falling back',
    async () => {
      const [server] = await db.query<{ version: number; available: boolean }>(`
      select current_setting('server_version_num')::int as version,
        exists (select 1 from pg_available_extensions where name = 'vector') as available`);
      expect(server?.available, 'the vector CI job must provide pgvector').toBe(true);
      expect(server?.version).toBeGreaterThanOrEqual(170000);
      expect(server?.version).toBeLessThan(180000);
    },
  );

  it('creates the extension, vector(768) column and valid cosine HNSW index when available', async () => {
    const [extension] = await db.query<{ available: boolean; installed: boolean }>(`
      select exists (select 1 from pg_available_extensions where name = 'vector') as available,
        exists (select 1 from pg_extension where extname = 'vector') as installed`);
    expect(extension?.installed).toBe(extension?.available);
    expect(await materialEmbeddingsReady(db)).toBe(extension?.available);
    const columns = await db.query(`select format_type(atttypid, atttypmod) as type
      from pg_attribute where attrelid = 'public.material_passages'::regclass
        and attname = 'embedding' and not attisdropped`);
    const indexes = await db.query(`select am.amname as method, op.opcname as operator_class,
        i.indisvalid as valid
      from pg_index i join pg_class c on c.oid = i.indexrelid
        join pg_am am on am.oid = c.relam join pg_opclass op on op.oid = i.indclass[0]
      where i.indrelid = 'public.material_passages'::regclass
        and c.relname = 'material_passages_embedding_idx'`);
    if (!extension?.available) {
      expect(columns).toEqual([]);
      expect(indexes).toEqual([]);
      return;
    }
    expect(columns).toEqual([{ type: 'vector(768)' }]);
    expect(indexes).toEqual([{ method: 'hnsw', operator_class: 'vector_cosine_ops', valid: true }]);
    // Actually resolve and execute the operator as well as inspecting the catalog.
    const vector = JSON.stringify([1, ...Array<number>(767).fill(0)]);
    expect(
      await db.query('select $1::vector(768) <=> $1::vector(768) as distance', [vector]),
    ).toEqual([{ distance: 0 }]);
  });
});
