// Vertex AI list prices, USD per 1M tokens (standard, ≤200k context).
// Source: https://cloud.google.com/vertex-ai/generative-ai/pricing, read
// 2026-09-25. "Text output (response and reasoning)" — thinking tokens are
// billed as output. Update here only; costs are stored per call.

type Price = { inputPerM: number; outputPerM: number };

const PRICES: Record<string, Price> = {
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'gemini-2.5-pro': { inputPerM: 1.25, outputPerM: 10 },
  // Gemini 3.x through the EU multi-region endpoint ("eu/…"): the "non-global" prices.
  'gemini-3.1-flash-lite': { inputPerM: 0.275, outputPerM: 1.65 },
  'gemini-3.5-flash-lite': { inputPerM: 0.33, outputPerM: 2.75 },
  'gemini-3.5-flash': { inputPerM: 1.65, outputPerM: 9.9 },
  // Introductory price until 2026-12-31; from 2027 twice that ($1.65 / $8.25).
  'gemini-3.6-flash': { inputPerM: 0.825, outputPerM: 4.125 },
  'gemini-3.7-flash': { inputPerM: 0.825, outputPerM: 4.125 },
  'gemini-3.8-flash': { inputPerM: 0.825, outputPerM: 4.125 },
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
