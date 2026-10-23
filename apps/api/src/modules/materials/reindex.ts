// Additive, restartable backfill. No transaction stays open during a provider call.
import type { Db } from '../../lib/db.js';
import type { EmbeddingGateway } from '../../llm/embeddings.js';
import { vectorLiteral } from '../../llm/embeddings.js';
import { materialEmbeddingsReady } from './passages.js';
import { embeddingColumn, embeddingPending } from '../../embeddings/storage.js';

async function requireIndex(db: Db, gateway: EmbeddingGateway): Promise<void> {
  if (!gateway.available) throw new Error('Re-indexing requires the target embedding space');
  if (!(await materialEmbeddingsReady(db, gateway)))
    throw new Error('Apply the additive migration on a database with pgvector first');
}
export async function pendingPassages(db: Db, gateway: EmbeddingGateway): Promise<number> {
  await requireIndex(db, gateway);
  return (
    await db.one<{ n: number }>(
      `select count(*)::int as n from material_passages where ${embeddingPending(gateway, 1)}`,
      [gateway.model, gateway.dimensions],
    )
  ).n;
}
export async function reindexBatch(
  db: Db,
  gateway: EmbeddingGateway,
  maxCostMicros = 1_000_000,
): Promise<{ written: number; read: number; costMicros: number }> {
  await requireIndex(db, gateway);
  const rows = await db.query<{ id: string; learner_id: string; text: string }>(
    `select id,learner_id,text from material_passages where ${embeddingPending(gateway, 1)} order by id limit 64`,
    [gateway.model, gateway.dimensions],
  );
  if (!rows.length) return { written: 0, read: 0, costMicros: 0 };
  // A token cannot contain less than one UTF-8 byte; this overestimates even non-Latin text.
  const ceiling = Math.ceil(
    rows.reduce((sum, row) => sum + Buffer.byteLength(row.text), 0) * gateway.microsPerInputToken,
  );
  if (ceiling > maxCostMicros)
    throw new Error('Re-indexing budget reached; existing vectors remain usable');
  const result = await gateway.embed({
    task: 'RETRIEVAL_DOCUMENT',
    texts: rows.map((row) => row.text),
    timeoutMs: 20_000,
  });
  if (
    result.usage.model !== gateway.model ||
    result.vectors.length !== rows.length ||
    result.vectors.some(
      (v) =>
        v.length !== gateway.dimensions ||
        v.some((n) => !Number.isFinite(n)) ||
        v.every((n) => n === 0),
    )
  )
    throw new Error('Invalid target vectors; batch unchanged');
  const written = await db.tx(async (tx) => {
    let count = 0;
    for (const [i, row] of rows.entries()) {
      const updated = await tx.query(
        `update material_passages set ${embeddingColumn(gateway)}=$4::vector, ${embeddingColumn(gateway)}_model=$5, ${embeddingColumn(gateway)}_dimensions=$6
        where id=$1 and learner_id=$2 and text=$3 and ${embeddingPending(gateway, 5)} returning id`,
        [
          row.id,
          row.learner_id,
          row.text,
          vectorLiteral(result.vectors[i]!),
          gateway.model,
          gateway.dimensions,
        ],
      );
      count += updated.length;
    }
    return count;
  });
  return { written, read: rows.length, costMicros: result.usage.costMicros };
}
