// Passages of a read sheet, for the hybrid material search (issues #23, #26).
//
// extracted_text is one long transcription; searching and pre-injecting work on
// passages of a few hundred characters (migration 0054 material_passages). The
// passage rows themselves are plain SQL and always written; their embeddings are
// a budgeted model call that may be skipped (no budget, no model, no pgvector) —
// a passage without an embedding is still found by full text and trigram.
// Indexing never fails the reading: a sheet is ready with or without its index.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { localParts } from '../../lib/time.js';
import { callEmbedding } from '../../llm/call.js';
import { vectorLiteral } from '../../llm/embeddings.js';

/** What indexing needs; both the reading job (full Deps) and the search path satisfy it. */
export type PassageDeps = Pick<Deps, 'db' | 'embeddings' | 'now'>;

/** Passage size the chunker aims for; the column allows 2000 (migration 0054). */
export const MAX_PASSAGE_CHARS = 700;
const MIN_PASSAGE_CHARS = 200;
/** A sheet grown by merged pages stays bounded (position is checked 0–199 in SQL). */
const MAX_PASSAGES = 120;

/**
 * extracted_text → passages: paragraphs (blank-line separated) greedily packed to
 * MAX_PASSAGE_CHARS; an oversized paragraph is split at word boundaries. Pure text
 * mechanics — no language understanding lives here.
 */
export function chunkPassages(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t]+/g, ' ').trim())
    .filter((p) => p.length > 0)
    .flatMap(splitOversized);
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    if (current !== '' && current.length + 1 + p.length > MAX_PASSAGE_CHARS) {
      chunks.push(current);
      current = p;
    } else {
      current = current === '' ? p : `${current}\n${p}`;
    }
  }
  if (current !== '') chunks.push(current);
  // A trailing crumb reads better glued to its predecessor than alone.
  if (chunks.length >= 2 && chunks[chunks.length - 1]!.length < MIN_PASSAGE_CHARS) {
    const tail = chunks.pop()!;
    const prev = chunks[chunks.length - 1]!;
    if (prev.length + 1 + tail.length <= 2000) chunks[chunks.length - 1] = `${prev}\n${tail}`;
    else chunks.push(tail);
  }
  return chunks.slice(0, MAX_PASSAGES);
}

function splitOversized(paragraph: string): string[] {
  if (paragraph.length <= MAX_PASSAGE_CHARS) return [paragraph];
  const parts: string[] = [];
  let rest = paragraph;
  while (rest.length > MAX_PASSAGE_CHARS) {
    let cut = rest.lastIndexOf(' ', MAX_PASSAGE_CHARS);
    if (cut < MIN_PASSAGE_CHARS) cut = MAX_PASSAGE_CHARS;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) parts.push(rest);
  return parts;
}

/**
 * Whether this database stores embeddings (the vector column exists only where
 * pgvector is available — Supabase yes, the local PG14 test server no; migration
 * 0054). Cached per Db instance; the schema never changes at runtime.
 */
const embeddingColumn = new WeakMap<object, Promise<boolean>>();

export function materialEmbeddingsReady(db: Db): Promise<boolean> {
  let cached = embeddingColumn.get(db);
  if (!cached) {
    cached = db
      .maybeOne(
        `select 1 as one from information_schema.columns
          where table_schema = 'public' and table_name = 'material_passages'
            and column_name = 'embedding'`,
      )
      .then((row) => row !== null);
    embeddingColumn.set(db, cached);
  }
  return cached;
}

/**
 * (Re)writes the passage rows of one ready sheet and, where possible, their
 * embeddings. Rewriting from scratch keeps merged pages simple: the caller passes
 * the sheet that carries the text (the merge target), and its passages follow the
 * grown text. Never throws (a failed index leaves the sheet ready and findable by
 * full text); returns what happened so tests and callers can tell.
 */
export async function indexMaterialPassages(
  deps: PassageDeps,
  input: { materialId: string; learnerId: string; timezone: string },
): Promise<'indexed' | 'embedded' | 'skipped'> {
  try {
    const written = await deps.db.tx(async (tx) => {
      const m = await tx.maybeOne<{ extracted_text: string | null }>(
        `select extracted_text from materials
          where id = $1 and learner_id = $2 and status = 'ready' and archived_at is null
          for update`,
        [input.materialId, input.learnerId],
      );
      if (!m?.extracted_text) return 0;
      const passages = chunkPassages(m.extracted_text);
      await tx.query(`delete from material_passages where material_id = $1`, [input.materialId]);
      for (const [i, text] of passages.entries()) {
        await tx.query(
          `insert into material_passages (material_id, learner_id, position, text, created_at)
           values ($1, $2, $3, $4, $5)`,
          [input.materialId, input.learnerId, i, text, deps.now()],
        );
      }
      return passages.length;
    });
    if (written === 0) return 'skipped';
  } catch (err) {
    console.warn(
      `[passages] indexing failed for material=${input.materialId}: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    );
    return 'skipped';
  }
  try {
    return (await embedMaterialPassages(deps, input)) ? 'embedded' : 'indexed';
  } catch (err) {
    // No budget left, or the provider is down: the rows are written and searchable
    // by full text and trigram; a later search's catch-up finishes the vectors.
    console.warn(
      `[passages] embedding failed for material=${input.materialId}: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    );
    return 'indexed';
  }
}

/**
 * Embeds the not-yet-embedded passages of one sheet (one batched budgeted call).
 * True when every passage of the sheet has an embedding afterwards.
 */
async function embedMaterialPassages(
  deps: PassageDeps,
  input: { materialId: string; learnerId: string; timezone: string },
): Promise<boolean> {
  if (!deps.embeddings.available || !(await materialEmbeddingsReady(deps.db))) return false;
  const rows = await deps.db.query<{ id: string; text: string }>(
    `select id, text from material_passages
      where material_id = $1 and learner_id = $2 and embedding is null
      order by position`,
    [input.materialId, input.learnerId],
  );
  if (rows.length === 0) return true;
  const day = localParts(deps.now(), input.timezone).date;
  const result = await callEmbedding(
    { db: deps.db, embeddings: deps.embeddings },
    input.learnerId,
    day,
    { task: 'RETRIEVAL_DOCUMENT', texts: rows.map((r) => r.text) },
  );
  for (const [i, row] of rows.entries()) {
    const vector = result.vectors[i];
    if (!vector) return false;
    await deps.db.query(
      `update material_passages set embedding = $2::vector where id = $1 and embedding is null`,
      [row.id, vectorLiteral(vector)],
    );
  }
  return true;
}

/**
 * Bounded catch-up for sheets read before migration 0054 (or whose indexing
 * failed): passages for up to `sheets` un-indexed ready sheets, newest first, and
 * one embedding batch for the newest sheet whose passages still lack vectors.
 * Called from the search path; every step is optional and non-fatal.
 */
export async function catchUpPassages(
  deps: PassageDeps,
  learnerId: string,
  timezone: string,
  sheets = 4,
): Promise<void> {
  try {
    const missing = await deps.db.query<{ id: string }>(
      `select m.id from materials m
        where m.learner_id = $1 and m.status = 'ready' and m.archived_at is null
          and m.extracted_text is not null
          and not exists (select 1 from material_passages p where p.material_id = m.id)
        order by m.ready_at desc nulls last limit $2`,
      [learnerId, sheets],
    );
    for (const m of missing) {
      await indexMaterialPassages(deps, { materialId: m.id, learnerId, timezone });
    }
    if (missing.length === 0 && deps.embeddings.available) {
      // Rows exist but vectors may not (an earlier budget stop): finish one sheet per search.
      if (!(await materialEmbeddingsReady(deps.db))) return;
      const unembedded = await deps.db.maybeOne<{ material_id: string }>(
        `select material_id from material_passages
          where learner_id = $1 and embedding is null
          order by created_at desc limit 1`,
        [learnerId],
      );
      if (unembedded) {
        await embedMaterialPassages(deps, {
          materialId: unembedded.material_id,
          learnerId,
          timezone,
        });
      }
    }
  } catch (err) {
    console.warn(
      `[passages] catch-up failed for learner=${learnerId}: ${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
    );
  }
}
