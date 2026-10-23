// What a model call cost, from one gateway's own price table (issue #648). A price belongs to the
// provider and endpoint that bills it, so every gateway brings its table (`VERTEX_EU_PRICES` for
// `vertex.ts` and `vertex-embeddings.ts`); a new gateway brings its own, read from that provider's
// price page, and never borrows this one. Costs are stored per call (`llm_calls.cost_micros`).
//
// A recorded cost is a ceiling, never an undercount: an unknown model is priced at the table's
// most expensive figures, and the prefix cache's discount is the provider's to give (vertex.ts
// `usageOf`), so cached input counts at the full price.

/** USD per 1M tokens, standard pay-as-you-go, up to 200k context. */
type ModelPrice = {
  inputPerM: number;
  outputPerM: number;
  /** Audio input, where the model bills it apart from text (3.1 Flash-Lite: twice the text price). */
  audioInputPerM?: number;
  /** The provider's discounted price for prefix-cache hits. Reporting only (cost comparison,
   * docs/decisions/cost-comparison-2026-10-23.md); `costMicros` keeps the full price. */
  cachedInputPerM?: number;
};

export type PriceTable = {
  /** The provider's price page the figures were read from, and when. */
  source: string;
  readOn: string;
  models: Readonly<Record<string, ModelPrice>>;
};

/** The tokens of one call, as the provider reported them. */
export type BilledTokens = {
  inputTokens: number;
  /** The part of `inputTokens` that was audio (0 when the provider reports no modality split). */
  audioInputTokens: number;
  outputTokens: number;
  /** Thinking is billed as output ("Text output (response and reasoning)"). */
  thoughtTokens: number;
};

/**
 * Vertex AI, Gemini 3.x through the EU multi-region endpoint (`eu/…`): the "non-global" prices,
 * +10 % on global. Read 2026-10-14 (KI-Audit F, §1).
 * - 3.6/3.7/3.8 Flash: the introductory price until 2026-12-31 is NOT a lower unit price — the
 *   invoice shows $1.65 / $8.25 and half of it comes back as credit on the 7th of the next month
 *   (expiring 30 days later). These are the net figures; the gross invoice is twice that. 3.6 is
 *   switched off on 2026-11-19; from 2027 3.8 costs $1.65 / $8.25.
 * - Embeddings have no billed output. gemini-embedding-001 lists $0.15/1M (global only); the
 *   table keeps the family's highest figure (embedding-2, $0.20) so a regional surcharge is covered.
 * - Cache-hit prices (10 % of input) re-read 2026-10-23 for the cost comparison; reporting only.
 * - The 2.5 models are gone: not offered in `eu`, switched off on 2026-10-20.
 */
export const VERTEX_EU_PRICES: PriceTable = {
  source: 'https://cloud.google.com/vertex-ai/generative-ai/pricing',
  readOn: '2026-10-14',
  models: {
    'gemini-3.1-flash-lite': {
      inputPerM: 0.275,
      audioInputPerM: 0.55,
      cachedInputPerM: 0.0275,
      outputPerM: 1.65,
    },
    'gemini-3.5-flash-lite': { inputPerM: 0.33, outputPerM: 2.75 },
    'gemini-3.5-flash': { inputPerM: 1.65, outputPerM: 9.9 },
    'gemini-3.6-flash': { inputPerM: 0.825, cachedInputPerM: 0.0825, outputPerM: 4.125 },
    'gemini-3.7-flash': { inputPerM: 0.825, cachedInputPerM: 0.0825, outputPerM: 4.125 },
    'gemini-3.8-flash': { inputPerM: 0.825, cachedInputPerM: 0.0825, outputPerM: 4.125 },
    'gemini-embedding-001': { inputPerM: 0.2, outputPerM: 0 },
  },
};

/** A dated snapshot (`gpt-5.4-mini-2026-03-17`) is billed at its model's price. */
export const priceModel = (model: string): string => model.replace(/-\d{4}-\d{2}-\d{2}$/, '');

const audioPrice = (p: ModelPrice): number => p.audioInputPerM ?? p.inputPerM;

/** The table's most expensive figure on every axis: what an unknown model is priced at. */
function ceilingOf(table: PriceTable): Required<Omit<ModelPrice, 'cachedInputPerM'>> {
  const all = Object.values(table.models);
  return {
    inputPerM: Math.max(...all.map((p) => p.inputPerM)),
    outputPerM: Math.max(...all.map((p) => p.outputPerM)),
    audioInputPerM: Math.max(...all.map(audioPrice)),
  };
}

export function costMicros(table: PriceTable, model: string, tokens: BilledTokens): number {
  const p = table.models[model] ?? ceilingOf(table);
  const audio = Math.min(tokens.audioInputTokens, tokens.inputTokens);
  return Math.ceil(
    (tokens.inputTokens - audio) * p.inputPerM +
      audio * audioPrice(p) +
      (tokens.outputTokens + tokens.thoughtTokens) * p.outputPerM,
  );
}
