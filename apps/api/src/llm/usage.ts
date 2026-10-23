import type { LlmUsage } from './gateway.js';

/** Sum provider receipts, including failed or repaired rounds. Reasoning is already split out. */
export function addUsage(left: LlmUsage | null, right: LlmUsage | null): LlmUsage | null {
  if (!left) return right;
  if (!right) return left;
  return {
    model: right.model,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    thoughtTokens: left.thoughtTokens + right.thoughtTokens,
    cachedTokens: left.cachedTokens + right.cachedTokens,
    costMicros: left.costMicros + right.costMicros,
    latencyMs: left.latencyMs + right.latencyMs,
  };
}
