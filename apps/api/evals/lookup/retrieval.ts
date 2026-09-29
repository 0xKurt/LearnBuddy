// Live retrieval eval for the hybrid material search (issue #23): does the
// right sheet come first for German compounds, synonyms and typos — full text
// alone vs. + trigram vs. + live gemini-embedding-001 vectors?
//
//   cd apps/api
//   npx tsx evals/lookup/retrieval.ts
//
// Reads apps/api/.env.local like the dev server; needs a local Postgres.
// The local test Postgres has no pgvector, so the vector list is computed
// in-process here: the same passages (from material_passages, written by the
// same chunker), embedded live, cosine per material, fused with the SAME
// fuseRrf the production search uses — only the distance computation runs in
// TypeScript instead of SQL (identical arithmetic on unit vectors). It also
// prints the distance distribution that calibrates VECTOR_PREINJECT_MAX_DIST.
// Exit code 1 when the hybrid beats no baseline case or loses one.
// requires live verification in Claude Code session (live embeddings)

import { randomUUID } from 'node:crypto';

import { config as loadDotenv } from 'dotenv';

import { loadConfig } from '../../src/config.js';
import {
  fuseRrf,
  lexicalLists,
  type Candidate,
} from '../../src/modules/buddy/connectors/material.js';
import { VertexEmbeddings } from '../../src/llm/vertex-embeddings.js';
import { testDatabaseAvailable } from '../../src/testing/database.js';
import { createTestEnv, onboard } from '../../src/testing/harness.js';
import { RETRIEVAL_CASES, SHEETS } from './fixtures.js';

loadDotenv({ path: '.env.local' });

const TZ = 'Europe/Berlin';

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

async function main(): Promise<void> {
  const config = loadConfig({
    ...process.env,
    // Only the Vertex part of the config is used; the search runs on a throwaway
    // test database (createTestEnv), never on this URL.
    DATABASE_URL:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres',
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://unused.local',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'unused-unused-unused',
    ADMIN_TOKEN_SECRET: process.env.ADMIN_TOKEN_SECRET ?? 'unused-unused-unused-unused-unused!',
  });
  if (config.LLM_BACKEND !== 'vertex')
    throw new Error('Set LLM_BACKEND=vertex and the Vertex variables (docs/SETUP-VERTEX.md)');
  if (!(await testDatabaseAvailable())) throw new Error('No local Postgres (LB_TEST_DATABASE_URL)');
  const embeddings = new VertexEmbeddings(config);
  let costMicros = 0;
  let tokens = 0;

  // Sheets on a throwaway database; the search's own catch-up chunks them into
  // material_passages (embeddings stay empty: no pgvector locally).
  const env = await createTestEnv({ embeddings: 'disabled' });
  try {
    const lena = await onboard(env, {
      relation: 'child',
      name: 'Lena',
      birthDate: '2014-02-10',
      pin: '4826',
    });
    const sheetIds = new Map<string, string>();
    for (const s of SHEETS) {
      const row = await env.db.one<{ id: string }>(
        `with subj as (
           insert into subjects (learner_id, name, kind) values ($1, $2, 'other')
           on conflict do nothing returning id)
         insert into materials (learner_id, client_request_id, status, photo_count, title,
                                extracted_text, ready_at, subject_id)
         values ($1, $5, 'ready', 1, $3, $4, $6, (select id from subj)) returning id`,
        [lena.learnerId, s.subject, s.title, s.text, randomUUID(), env.clock.now()],
      );
      sheetIds.set(row.id, s.key);
    }
    // Index every sheet's passages (the search's catch-up is bounded per call, so
    // warm up until the count stops growing).
    let indexed = -1;
    for (;;) {
      await lexicalLists(env.deps, lena.learnerId, TZ, 'aufwärmen');
      const { n } = await env.db.one<{ n: number }>(
        `select count(*)::int as n from material_passages where learner_id = $1`,
        [lena.learnerId],
      );
      if (n === indexed) break;
      indexed = n;
    }
    const passages = await env.db.query<{ id: string; material_id: string; text: string }>(
      `select id, material_id, text from material_passages where learner_id = $1 order by material_id, position`,
      [lena.learnerId],
    );
    if (passages.length === 0) throw new Error('no passages were indexed');
    const covered = new Set(passages.map((p) => p.material_id));
    if (covered.size !== SHEETS.length)
      throw new Error(`only ${covered.size}/${SHEETS.length} sheets have passages`);

    // All passages embedded live, in one batch per call limit.
    const docs = await embeddings.embed({
      task: 'RETRIEVAL_DOCUMENT',
      texts: passages.map((p) => p.text),
    });
    costMicros += docs.usage.costMicros;
    tokens += docs.usage.inputTokens;

    const wins = { fts: 0, lexical: 0, hybrid: 0 };
    const top3 = { fts: 0, lexical: 0, hybrid: 0 };
    const matchedDists: number[] = [];
    const bestWrongDists: number[] = [];
    console.info('case              kind        fts  +trgm  +vec   dist(match) dist(best wrong)');
    for (const c of RETRIEVAL_CASES) {
      const lists = await lexicalLists(env.deps, lena.learnerId, TZ, c.query);
      const fts = lists?.fts ?? [];
      const trgm = lists?.trgm ?? [];
      const q = await embeddings.embed({ task: 'RETRIEVAL_QUERY', texts: [c.query] });
      costMicros += q.usage.costMicros;
      tokens += q.usage.inputTokens;
      const qv = q.vectors[0]!;
      // Best (closest) passage per material — the same rule as the SQL list.
      const byMaterial = new Map<string, { dist: number; text: string }>();
      for (const [i, p] of passages.entries()) {
        const dist = 1 - dot(qv, docs.vectors[i]!);
        const best = byMaterial.get(p.material_id);
        if (!best || dist < best.dist) byMaterial.set(p.material_id, { dist, text: p.text });
      }
      const vector: Candidate[] = [...byMaterial.entries()]
        .sort((a, b) => a[1].dist - b[1].dist)
        .slice(0, 12)
        .map(([materialId, v]) => ({ materialId, passage: v.text, vectorDist: v.dist }));

      const rank = (fused: Array<{ materialId: string }>): number => {
        const at = fused.findIndex((f) => sheetIds.get(f.materialId) === c.expected);
        return at < 0 ? 99 : at + 1;
      };
      const rFts = rank(fuseRrf(fts, [], []));
      const rLex = rank(fuseRrf(fts, trgm, []));
      const rHyb = rank(fuseRrf(fts, trgm, vector));
      if (rFts === 1) wins.fts++;
      if (rLex === 1) wins.lexical++;
      if (rHyb === 1) wins.hybrid++;
      if (rFts <= 3) top3.fts++;
      if (rLex <= 3) top3.lexical++;
      if (rHyb <= 3) top3.hybrid++;

      const matched = [...byMaterial.entries()].find(([id]) => sheetIds.get(id) === c.expected);
      const wrong = [...byMaterial.entries()]
        .filter(([id]) => sheetIds.get(id) !== c.expected)
        .sort((a, b) => a[1].dist - b[1].dist)[0];
      if (matched) matchedDists.push(matched[1].dist);
      if (wrong) bestWrongDists.push(wrong[1].dist);
      const show = (r: number) => (r === 99 ? '—' : `#${r}`);
      console.info(
        `${c.id.padEnd(18)}${c.kind.padEnd(12)}${show(rFts).padEnd(5)}${show(rLex).padEnd(7)}${show(rHyb).padEnd(7)}` +
          `${matched ? matched[1].dist.toFixed(3) : '  —  '}       ${wrong ? wrong[1].dist.toFixed(3) : '—'}`,
      );
    }
    const n = RETRIEVAL_CASES.length;
    console.info(
      `\ntop-1: fts ${wins.fts}/${n} · +trigram ${wins.lexical}/${n} · +vector ${wins.hybrid}/${n}` +
        `\ntop-3: fts ${top3.fts}/${n} · +trigram ${top3.lexical}/${n} · +vector ${top3.hybrid}/${n}`,
    );
    matchedDists.sort((a, b) => a - b);
    bestWrongDists.sort((a, b) => a - b);
    console.info(
      `matched-sheet distance: min ${matchedDists[0]?.toFixed(3)} · max ${matchedDists.at(-1)?.toFixed(3)}` +
        ` — best WRONG sheet: min ${bestWrongDists[0]?.toFixed(3)} (calibrates VECTOR_PREINJECT_MAX_DIST)`,
    );
    console.info(
      `cost: $${(costMicros / 1e6).toFixed(6)} for ${tokens} embedding tokens (${passages.length} passages + ${n} queries)`,
    );
    process.exit(wins.hybrid >= wins.lexical && wins.hybrid > wins.fts ? 0 : 1);
  } finally {
    await env.close();
  }
}

void main();
