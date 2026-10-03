// Buddy's own checks for the browser walkthrough, chosen by **why Buddy is checking** — not by
// the order the specs happen to run in (issue #81, the same lesson as turns.ts and
// generations.ts).
//
// A check runs whenever something wakes Buddy: a sheet that was read, a practice she finished.
// Every spec that finishes a practice wakes him, so a queued answer went to whichever spec got
// there first — charts.spec.ts (#245) runs before core-loop.spec.ts and took the "prepare a
// practice" answer meant for the core loop's worksheet; the core loop then never got its
// practice, and every queued answer after it was shifted (the red walkthrough of PR #303).
//
// Rules match the request the server sends (its STATE and TRIGGERS blocks say whose check it is
// and why Buddy is looking), so every spec is independent of the others. A check no rule is
// about stays what it always was: an unscripted model call, which the check answers with its
// fixed fallback — tour.spec.ts relies on exactly that for the practice from its sheet.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { ScriptedGateway } from '../fakes.js';
import { RuleBook, type Rule } from './rules.js';

export type CheckRule = Rule;

// A check no rule is about: the same error as a purpose nobody scripted.
const book = new RuleBook('buddy_check');

/** Scenarios add their rules; the order only decides which of two matching rules wins. */
export function scriptChecks(...added: CheckRule[]): void {
  book.add(...added);
}

/** Installs the dispatcher; call it once, after every scenario has added its rules. */
export function installChecks(llm: ScriptedGateway): void {
  book.install(llm);
}
