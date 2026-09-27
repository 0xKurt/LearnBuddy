// Buddy's reply while the model is still writing it (docs/architecture.md §Speed).
//
// The model writes its answer in the schema's order: lookups, actions, then the
// reply (registry.ts TurnDecisionForModel). So when the reply starts, code
// already knows what the answer does. Only a reply whose answer changes nothing
// — no lookups (then this reply is thrown away), and only actions that touch
// nothing (a button to tap) — may be shown and spoken before the answer is
// validated and applied. Anything else is shown once it is applied: nothing is
// ever claimed before it is true (CLAUDE.md rules 1 and 5). Shown is not spoken: the app
// reads a reply aloud only once it is validated and stored, after the provider's final
// safety verdict (audit M-52).

import { partialString } from '../../llm/partial.js';
import { ACT_TOOLS, REPLY_MAX } from './registry.js';

export type ReplyProgress = {
  /** The reply as far as it is written. */
  text: string;
  /** The answer changes nothing: the text may be shown and spoken now. */
  speakable: boolean;
  /** The reply is complete (the rest of the answer may still be coming). */
  done: boolean;
};

const REPLY_KEY = /"reply"\s*:/;

/** What can be said about the reply in `raw`, the answer written so far; null before it starts. */
export function replyProgress(raw: string): ReplyProgress | null {
  const reply = partialString(raw, 'reply');
  if (!reply) return null;
  // Only text that can pass validation is shown early: a reply over the schema's limit is
  // withdrawn later, so it is never shown while written (audit repro-28).
  const fits = reply.text.trim().length <= REPLY_MAX;
  return { text: reply.text, speakable: fits && changesNothing(raw), done: reply.done };
}

function changesNothing(raw: string): boolean {
  const at = raw.search(REPLY_KEY);
  if (at < 0) return false;
  // Everything before the reply is complete: close the object there and read it.
  const head = raw.slice(0, at).replace(/,\s*$/, '');
  let before: unknown;
  try {
    before = JSON.parse(`${head}}`);
  } catch {
    return false;
  }
  if (!before || typeof before !== 'object') return false;
  const { lookups, actions, concern } = before as {
    lookups?: unknown;
    actions?: unknown;
    concern?: unknown;
  };
  // A safeguarding answer: code replaces the model's words, so they are never shown.
  if (concern === true) return false;
  if (Array.isArray(lookups) && lookups.length > 0) return false;
  if (!Array.isArray(actions)) return false;
  return actions.every((a) => {
    const tool = (a as { tool?: unknown } | null)?.tool;
    if (typeof tool !== 'string' || !(tool in ACT_TOOLS)) return false;
    const spec = ACT_TOOLS[tool as keyof typeof ACT_TOOLS];
    return spec.touches.every((t) => t === 'nothing');
  });
}
