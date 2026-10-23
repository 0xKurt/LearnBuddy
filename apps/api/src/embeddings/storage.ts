import type { EmbeddingGateway } from '../llm/embeddings.js';
/** Identifiers are chosen from constants, never request data or provider output. */
export function embeddingColumn(gateway?: EmbeddingGateway): 'embedding' | 'embedding_openai' {
  return gateway?.space === 'openai-small-1536' ? 'embedding_openai' : 'embedding';
}

/** SQL structure only; model identity and dimensionality are always bound parameters. */
export function embeddingMatches(
  gateway: EmbeddingGateway,
  parameter: number,
  prefix: '' | 'p.' = '',
): string {
  const column = `${prefix}${embeddingColumn(gateway)}`;
  return `${column} is not null and ${column}_model = $${parameter} and ${column}_dimensions = $${parameter + 1}`;
}
export function embeddingPending(gateway: EmbeddingGateway, parameter: number): string {
  return `not coalesce((${embeddingMatches(gateway, parameter)}), false)`;
}
