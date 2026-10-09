// The seam for text embeddings (hybrid material search, issue #23) — separate
// from the chat seam (gateway.ts) because an embedding call has no prompt, no
// schema and no output tokens, only vectors. Implementations: VertexEmbeddings
// (production, gemini-embedding-001 in an EU region), DisabledEmbeddings (no
// model configured — search runs as full text + trigram only, never worse than
// before), FakeEmbeddings (tests, src/testing/fakes.ts).

import { LlmError } from './gateway.js';

/** One dimensionality everywhere: the stored vectors (migration 0054) and every query. */
export const EMBED_DIMENSIONS = 768;

/** Passages are stored with one task type, queries with the other (asymmetric retrieval). */
type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export type EmbedRequest = { task: EmbedTask; texts: string[] };

type EmbedUsage = {
  model: string;
  /** Provider-reported where available; otherwise a conservative estimate (never 0 for real text). */
  inputTokens: number;
  costMicros: number;
  latencyMs: number;
};

export type EmbedResult = {
  /** One unit-length vector per input text, in order (EMBED_DIMENSIONS each). */
  vectors: number[][];
  usage: EmbedUsage;
};

export interface EmbeddingGateway {
  readonly available: boolean;
  embed(req: EmbedRequest): Promise<EmbedResult>;
}

export class DisabledEmbeddings implements EmbeddingGateway {
  readonly available = false;
  async embed(): Promise<EmbedResult> {
    throw new LlmError('unavailable', 'No embedding model is configured (LLM_BACKEND=disabled)');
  }
}

/**
 * In place, to unit length. gemini-embedding-001 returns unnormalised vectors below
 * 3072 dimensions (measured live 2026-09-29: norm ≈ 0.586 at 768d); cosine distance
 * in SQL and dot products in evals both assume unit vectors.
 */
export function normalise(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vector;
  for (let i = 0; i < vector.length; i++) vector[i]! /= norm;
  return vector;
}

/** The Postgres literal for a pgvector value ('[0.1,0.2,…]'), passed as a text parameter. */
export function vectorLiteral(vector: number[]): string {
  return `[${vector.map((v) => (Number.isFinite(v) ? v.toFixed(8) : '0')).join(',')}]`;
}
