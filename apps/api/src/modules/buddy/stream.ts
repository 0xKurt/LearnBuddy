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

import { replyFormatErrors, visibleReplyPrefix } from './replyFormat.js';
import { repairLatexEscapes } from '../../llm/latex.js';
import { partialString } from '../../llm/partial.js';
import { ACT_TOOLS, REPLY_MAX, turnActionSchema } from './registry.js';

export type ReplyProgress = {
  /** The reply as far as it is written. */
  text: string;
  /** The answer changes nothing: the text may be shown and spoken now. */
  speakable: boolean;
  /** The reply is complete (the rest of the answer may still be coming). */
  done: boolean;
};

const REPLY_KEY = /"reply"\s*:/;

/**
 * What can be said about the reply in `raw`, the answer written so far; null before it starts.
 * `aliases` are the aliases of the STATE this answer was written against (`g1`, `sh2` …): an
 * action naming any other is rejected later, so its reply is not spoken early (#666).
 */
export function replyProgress(raw: string, aliases: ReadonlySet<string>): ReplyProgress | null {
  const reply = partialString(raw, 'reply');
  if (!reply) return null;
  // Only text that can pass validation is shown early: a reply over the schema's limit is
  // withdrawn later, so it is never shown while written (audit repro-28).
  const fits = reply.text.trim().length <= REPLY_MAX;
  const visible = visibleReplyPrefix(reply.text, reply.done);
  // The same LaTeX repair as the stored reply, so "\times" never shows as TAB + "imes"
  // while it is written (p2-streamed-reply-unrepaired-latex-escapes).
  return {
    text: repairLatexEscapes(visible),
    speakable:
      visible.length > 0 &&
      fits &&
      replyFormatErrors(reply.text).length === 0 &&
      changesNothing(raw, aliases),
    done: reply.done,
  };
}

/** An alias as STATE writes them: one or two letters and a number. */
const ALIAS = /^[a-z]{1,2}\d{1,3}$/;

/** Every string in an action's arguments that has the shape of an alias. */
function aliasesIn(v: unknown): string[] {
  if (typeof v === 'string') return ALIAS.test(v) ? [v] : [];
  if (Array.isArray(v)) return v.flatMap(aliasesIn);
  if (v && typeof v === 'object') return Object.values(v).flatMap(aliasesIn);
  return [];
}

/**
 * The aliases of a STATE, all kinds together: the core's goals, steps and memories and whatever
 * a domain adds (subjects, sheets).
 */
export function aliasSet(aliases: object): Set<string> {
  const keys = new Set<string>();
  for (const map of Object.values(aliases))
    if (map instanceof Map) for (const k of map.keys()) if (typeof k === 'string') keys.add(k);
  return keys;
}

/**
 * Whether an answer whose reply is being written changes nothing AND will pass the checks its
 * actions face after it is finished (#666, audit F12): "touches nothing" alone let an
 * `offer_learning` with an invalid kind be spoken — "Deine Übung ist bereit" — and then be
 * rejected, so the learner heard a promise with no button and, after the repair, a second answer.
 * So each action must also parse as the turn's action schema and name only aliases of this
 * STATE. Anything else waits for the validated answer; replies without actions are unchanged.
 */
function changesNothing(raw: string, aliases: ReadonlySet<string>): boolean {
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
    if (!spec.touches.every((t) => t === 'nothing')) return false;
    const parsed = turnActionSchema().safeParse(a);
    if (!parsed.success) return false;
    return aliasesIn(parsed.data.args).every((x) => aliases.has(x));
  });
}
