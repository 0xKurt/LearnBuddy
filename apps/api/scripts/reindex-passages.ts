// Default is read-only. Operator: source the environment, inspect, then --apply --max-usd=1.
// This script never changes the active provider or removes legacy vectors.
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/lib/db.js';
import { openAIClient } from '../src/llm/openai-client.js';
import { VertexEmbeddings } from '../src/llm/vertex-embeddings.js';
import { OpenAIEmbeddings } from '../src/embeddings/openai.js';
import { pendingPassages, reindexBatch } from '../src/modules/materials/reindex.js';

const config = loadConfig();
const db = createDb(config.DATABASE_URL, { ca: config.DATABASE_CA_CERT });
const target = process.argv.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'openai';
if (!['openai', 'vertex'].includes(target)) throw new Error('--target must be openai or vertex');
if (target === 'vertex' && !config.GOOGLE_CLOUD_PROJECT)
  throw new Error('GOOGLE_CLOUD_PROJECT required for rollback');
const gateway =
  target === 'vertex' ? new VertexEmbeddings(config) : new OpenAIEmbeddings(openAIClient(config));
const apply = process.argv.includes('--apply');
const maxUsd = Number(process.argv.find((a) => a.startsWith('--max-usd='))?.split('=')[1] ?? '1');
if (!Number.isFinite(maxUsd) || maxUsd <= 0) throw new Error('--max-usd must be positive');
let costMicros = 0,
  written = 0;
try {
  let pending = await pendingPassages(db, gateway);
  console.info(
    JSON.stringify({
      apply,
      target,
      model: gateway.model,
      dimensions: gateway.dimensions,
      pending,
      maxUsd,
    }),
  );
  while (apply && pending > 0) {
    const batch = await reindexBatch(db, gateway, Math.floor(maxUsd * 1e6) - costMicros);
    costMicros += batch.costMicros;
    written += batch.written;
    pending = await pendingPassages(db, gateway);
    console.info(JSON.stringify({ written, pending, costMicros }));
    if (batch.read > 0 && batch.written === 0)
      throw new Error('Passages changed during indexing; rerun after writes settle');
  }
  if (pending > 0) process.exitCode = 2;
} finally {
  await db.close();
}
