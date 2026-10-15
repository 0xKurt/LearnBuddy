// What each model purpose may send before the learner's own words (issue #651, KI-Audit F2 (4)):
// the system prompt and the response schema in characters, the largest of the purpose's calls
// (`inventory.ts` `variants()`). Both are billed as input on every call — Gemini bills the schema
// as input tokens too — and both grew for weeks without anyone being told (KI-Audit §3.2). The
// guard (`__tests__/budgets.test.ts`) turns CI red when a purpose sends more than its budget.
//
// Characters, not tokens: they are exact and need no model, so the guard runs on every commit.
// The inventory adds the provider's own token count when Vertex is configured (`inventory.ts`).
//
// The budgets are today's sizes (2026-10-15, commit before #651), rounded up to the next 500. They
// only shrink, like every Ausnahmeliste (#753): `tools/guards/no-growth.mjs` compares every number
// with main (`source-lists.mjs` `PROMPT_BUDGETS`), and a raised one is red unless a commit says
// `Ausnahmeliste-Zuwachs: #<issue> <reason>`. A prompt that shrank lowers its number to hold the
// saving.
//
// Target, not yet held: Buddy's turn schema at 25 000 characters (KI-Audit F3). Today it is 43 216.
// requires live verification in Claude Code session (the budgets are offline; tokens need Vertex)

import type { LlmPurpose } from '../../src/llm/gateway.js';

export type PromptBudget = { systemChars: number; schemaChars: number };

export const PROMPT_BUDGETS: Partial<Record<LlmPurpose, PromptBudget>> = {
  buddy_turn: { systemChars: 33_000, schemaChars: 43_500 },
  buddy_check: { systemChars: 11_500, schemaChars: 7_500 },
  explain: { systemChars: 38_000, schemaChars: 33_000 },
  forms: { systemChars: 42_500, schemaChars: 1_000 },
  extraction: { systemChars: 42_500, schemaChars: 36_000 },
  tutor: { systemChars: 8_500, schemaChars: 2_500 },
  reexplain: { systemChars: 2_500, schemaChars: 6_500 },
  hints: { systemChars: 3_000, schemaChars: 3_000 },
  figures: { systemChars: 3_000, schemaChars: 1_000 },
  pronounce: { systemChars: 2_000, schemaChars: 1_500 },
  transcribe: { systemChars: 2_500, schemaChars: 1_000 },
  consolidate: { systemChars: 1_000, schemaChars: 1_000 },
  summary: { systemChars: 1_000, schemaChars: 500 },
};

type Sent = { purpose: string; profile: string; system?: string; schema?: object };

/** Every call that sends more than its purpose's budget, or whose purpose has none, in words. */
export function overBudget(calls: readonly Sent[]): string[] {
  const out: string[] = [];
  for (const c of calls) {
    const budget = PROMPT_BUDGETS[c.purpose as LlmPurpose];
    const name = `${c.purpose} — ${c.profile}`;
    if (!budget) {
      out.push(`${name}: no budget in evals/schema/budgets.ts`);
      continue;
    }
    const system = c.system?.length ?? 0;
    const schema = c.schema ? JSON.stringify(c.schema).length : 0;
    if (system > budget.systemChars)
      out.push(`${name}: system prompt ${system} chars > budget ${budget.systemChars}`);
    if (schema > budget.schemaChars)
      out.push(`${name}: schema ${schema} chars > budget ${budget.schemaChars}`);
  }
  return out;
}
