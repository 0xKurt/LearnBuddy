// requires live verification in Claude Code session (real Postgres, scripted external vectors)
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestEnv, onboard, type TestEnv } from '../testing/harness.js';
import { testDatabaseAvailable } from '../testing/database.js';
import { materialEmbeddingsReady, indexMaterialPassages } from '../modules/materials/passages.js';
import { searchMaterials } from '../modules/buddy/connectors/material.js';
import { reindexBatch, pendingPassages } from '../modules/materials/reindex.js';
import type { EmbeddingGateway } from '../llm/embeddings.js';

const vector = Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0));
const gateway: EmbeddingGateway = {
  available: true,
  space: 'openai-small-1536',
  model: 'text-embedding-3-small',
  dimensions: 1536,
  microsPerInputToken: 0.02,
  async embed(req) {
    return {
      vectors: req.texts.map(() => vector),
      usage: { model: 'text-embedding-3-small', inputTokens: 1, costMicros: 1, latencyMs: 1 },
    };
  },
};
describe.skipIf(!(await testDatabaseAvailable()))('additive material index switch', () => {
  let env: TestEnv;
  beforeEach(async () => {
    env = await createTestEnv();
  });
  afterEach(async () => {
    await env.closeChecked();
  });
  it('reserves migration 0115 and keeps per-space model and dimension metadata', async () => {
    const columns = await env.db.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name='material_passages' and column_name in ('embedding_model','embedding_dimensions','embedding_openai_model','embedding_openai_dimensions')`,
    );
    expect(columns).toHaveLength(4);
    const { EXPECTED_MIGRATIONS } = await import('../lib/migrations.js');
    expect(EXPECTED_MIGRATIONS).toContain('0115_openai_passage_vectors');
    expect(EXPECTED_MIGRATIONS).not.toContain('0114_openai_passage_vectors');
  });
  it('adds only the new dimension and index; retains the old dimension', async () => {
    const available = await materialEmbeddingsReady(env.db);
    expect(await materialEmbeddingsReady(env.db, gateway)).toBe(available);
    if (process.env.LB_REQUIRE_PGVECTOR === '1') expect(available).toBe(true);
    if (!available) return;
    expect(
      await env.db.query(
        `select attname,format_type(atttypid,atttypmod) as type from pg_attribute where attrelid='material_passages'::regclass and attname in ('embedding','embedding_openai') order by attname`,
      ),
    ).toEqual([
      { attname: 'embedding', type: 'vector(768)' },
      { attname: 'embedding_openai', type: 'vector(1536)' },
    ]);
    const index = await env.db.one<{ indisvalid: boolean }>(
      `select indisvalid from pg_index where indexrelid='material_passages_openai_idx'::regclass`,
    );
    expect(index.indisvalid).toBe(true);
  });
  it('stops re-indexing clearly when pgvector is unavailable', async () => {
    if (await materialEmbeddingsReady(env.db, gateway)) return;
    await expect(reindexBatch(env.db, gateway)).rejects.toThrow(/pgvector/);
  });
  it('re-indexes idempotently without touching legacy vectors, then searches only the new space', async (ctx) => {
    if (!(await materialEmbeddingsReady(env.db, gateway))) ctx.skip();
    const lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    const tom = await onboard(env, {
      relation: 'child',
      name: 'Tom',
      birthDate: '2013-05-01',
      pin: '1357',
    });
    for (const learnerId of [lena.learnerId, tom.learnerId]) {
      const { id } = await env.db.one<{ id: string }>(
        `insert into materials(learner_id,client_request_id,status,photo_count,title,extracted_text,ready_at) values($1,$2,'ready',1,'Pflanzen','Pflanzen verwandeln Licht in Zucker.',$3) returning id`,
        [learnerId, randomUUID(), env.clock.now()],
      );
      await indexMaterialPassages(env.deps, {
        materialId: id,
        learnerId,
        timezone: 'Europe/Berlin',
      });
    }
    const before = await env.db.query(
      'select id,embedding::text as vector from material_passages order by id',
    );
    expect(await pendingPassages(env.db, gateway)).toBe(2);
    expect((await reindexBatch(env.db, gateway)).written).toBe(2);
    expect(await pendingPassages(env.db, gateway)).toBe(0);
    expect((await reindexBatch(env.db, gateway)).written).toBe(0);
    expect(
      await env.db.query('select id,embedding::text as vector from material_passages order by id'),
    ).toEqual(before);
    expect(
      await env.db.query(
        'select distinct embedding_openai_model as model,embedding_openai_dimensions as dimensions from material_passages',
      ),
    ).toEqual([{ model: gateway.model, dimensions: gateway.dimensions }]);
    // A replacement with the same dimensionality still needs a complete re-index.
    const replacement: EmbeddingGateway = {
      ...gateway,
      model: 'replacement-1536',
      async embed(req) {
        const result = await gateway.embed(req);
        return { ...result, usage: { ...result.usage, model: 'replacement-1536' } };
      },
    };
    // Wrong-model vectors must not supply a query hit while the new model's backfill is down.
    const unavailableReplacement: EmbeddingGateway = {
      ...replacement,
      async embed(req) {
        if (req.task === 'RETRIEVAL_DOCUMENT') throw new Error('backfill unavailable');
        return replacement.embed(req);
      },
    };
    expect(
      await searchMaterials(
        { ...env.deps, embeddings: unavailableReplacement },
        lena.learnerId,
        'Europe/Berlin',
        'UnbekannterSuchbegriff',
        5,
      ),
    ).toEqual([]);
    expect(await pendingPassages(env.db, replacement)).toBe(2);
    expect((await reindexBatch(env.db, replacement)).written).toBe(2);
    expect(await pendingPassages(env.db, replacement)).toBe(0);
    expect(await pendingPassages(env.db, gateway)).toBe(2);
    // Switching back is a real backfill into the old model, not a relabel.
    expect((await reindexBatch(env.db, gateway)).written).toBe(2);
    const hits = await searchMaterials(
      { ...env.deps, embeddings: gateway },
      lena.learnerId,
      'Europe/Berlin',
      'Licht Zucker',
      5,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]?.title).toBe('Pflanzen');
    // A passage created only in the new space must be backfilled before rollback.
    await env.db.query(
      'update material_passages set embedding=null,embedding_model=null,embedding_dimensions=null',
    );
    expect(await pendingPassages(env.db, env.embeddings)).toBe(2);
    expect((await reindexBatch(env.db, env.embeddings)).written).toBe(2);
    expect(await pendingPassages(env.db, env.embeddings)).toBe(0);
    expect(await pendingPassages(env.db, gateway)).toBe(0);
  });
  it('does not attach an old vector to a changed passage, and a failed batch stays resumable', async (ctx) => {
    if (!(await materialEmbeddingsReady(env.db, gateway))) ctx.skip();
    const learner = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    const { id } = await env.db.one<{ id: string }>(
      `insert into materials(learner_id,client_request_id,status,photo_count,title,extracted_text,ready_at) values($1,$2,'ready',1,'Pflanzen','Pflanzen brauchen Wasser.',$3) returning id`,
      [learner.learnerId, randomUUID(), env.clock.now()],
    );
    await indexMaterialPassages(env.deps, {
      materialId: id,
      learnerId: learner.learnerId,
      timezone: 'Europe/Berlin',
    });
    const failure: EmbeddingGateway = {
      ...gateway,
      async embed() {
        throw new Error('outage');
      },
    };
    await expect(reindexBatch(env.db, failure)).rejects.toThrow('outage');
    expect(await pendingPassages(env.db, gateway)).toBe(1);
    const changed: EmbeddingGateway = {
      ...gateway,
      async embed(req) {
        await env.db.query('update material_passages set text=$1 where material_id=$2', [
          'Anderer Inhalt.',
          id,
        ]);
        return gateway.embed(req);
      },
    };
    expect((await reindexBatch(env.db, changed)).written).toBe(0);
    expect(await pendingPassages(env.db, gateway)).toBe(1);
    expect((await reindexBatch(env.db, gateway)).written).toBe(1);
  });
});
