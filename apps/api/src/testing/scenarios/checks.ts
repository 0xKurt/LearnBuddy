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
// Rules match the request the server sends (its TRIGGERS block says why Buddy is looking), so
// every spec is independent of the others. A check no rule is about waits: "nothing to add" is
// what Buddy decides most of the time, and it changes nothing a spec looks at.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { ScriptedGateway } from '../fakes.js';

export type CheckRule = {
  /** What the check request must contain (matched over its text). */
  when: RegExp;
  /** Buddy's decision; a function sees the whole request. */
  answer: (req: LlmRequest) => unknown;
};

const rules: CheckRule[] = [];

/** Scenarios add their rules; the order only decides which of two matching rules wins. */
export function scriptChecks(...added: CheckRule[]): void {
  rules.push(...added);
}

const WAIT = {
  disposition: 'wait',
  reason: 'Nothing to add now.',
  actions: [],
  outreach: null,
};

/** Installs the dispatcher; call it once, after every scenario has added its rules. */
export function installChecks(llm: ScriptedGateway): void {
  llm.byDefault('buddy_check', (req: LlmRequest) => {
    const text = ScriptedGateway.textOf(req);
    const rule = rules.find((r) => r.when.test(text));
    return rule ? rule.answer(req) : WAIT;
  });
}
