// Vertex AI list prices, USD per 1M tokens (standard, ≤200k context).
// Source: https://cloud.google.com/vertex-ai/generative-ai/pricing, read
// 2026-09-25. "Text output (response and reasoning)" — thinking tokens are
// billed as output. Update here only; costs are stored per call.

type Price = { inputPerM: number; outputPerM: number };

const PRICES: Record<string, Price> = {
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
};

/** Unknown models are priced like the most expensive known one (never under-count). */
const FALLBACK: Price = { inputPerM: 1.25, outputPerM: 10 };

export function costMicros(
  model: string,
  inputTokens: number,
  outputTokens: number,
  thoughtTokens: number,
): number {
  const p = PRICES[model] ?? FALLBACK;
  return Math.ceil(inputTokens * p.inputPerM + (outputTokens + thoughtTokens) * p.outputPerM);
}
