// Buddy's reply while the model is still writing it (docs/architecture.md §Speed).
//
// The model writes its answer in the schema's order: lookups, actions, then the
// reply (registry.ts TurnDecisionForModel). So when the reply starts, code
// already knows what the answer does. Only a reply whose answer changes nothing
// — no lookups (then this reply is thrown away), and only actions that touch
// nothing (a button to tap) — may be shown and spoken before the answer is
// validated and applied. Anything else is shown once it is applied: nothing is
// ever claimed before it is true (CLAUDE.md rules 1 and 5).

import { partialString } from '../../llm/partial.js';
import { ACT_TOOLS } from './registry.js';

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
  return { text: reply.text, speakable: changesNothing(raw), done: reply.done };
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
  const { lookups, actions } = before as { lookups?: unknown; actions?: unknown };
  if (Array.isArray(lookups) && lookups.length > 0) return false;
  if (!Array.isArray(actions)) return false;
  return actions.every((a) => {
    const tool = (a as { tool?: unknown } | null)?.tool;
    if (typeof tool !== 'string' || !(tool in ACT_TOOLS)) return false;
    const spec = ACT_TOOLS[tool as keyof typeof ACT_TOOLS];
    return spec.touches.every((t) => t === 'nothing');
  });
}
