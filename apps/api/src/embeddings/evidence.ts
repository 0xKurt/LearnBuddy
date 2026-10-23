import type { EmbeddingGateway } from '../llm/embeddings.js';
/**
 * Provider-specific calibration, docs/measurements/eu-speech-search-2026-10-23.md.
 * Small: all 18 matched queries <= .643; six unrelated queries >= .717.
 * A .04 margin rejects adjacent wrong sheets (absolute similarity alone does not).
 * Existing Gemini calibration stays unchanged: 13/14 matches at .35.
 */
export function clearVectorDistances(
  space: EmbeddingGateway['space'],
  distances: number[],
): Set<number> {
  if (space !== 'openai-small-1536') return new Set(distances.filter((d) => d <= 0.35));
  const ranked = distances.filter(Number.isFinite).sort((a, b) => a - b);
  const best = ranked[0];
  return best !== undefined && best <= 0.66 && (ranked[1] === undefined || ranked[1] - best >= 0.04)
    ? new Set([best])
    : new Set();
}
