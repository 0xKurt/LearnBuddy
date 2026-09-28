// Chat answers for the browser walkthrough, chosen by **what the learner wrote** — not by
// the order the specs happen to run in (issue #81).
//
// Before this, every scenario pushed its answers into one queue per purpose. A spec that
// sent one message more or less, or failed halfway, shifted the queue for every spec after
// it: one real fault caused three false ones, and the walkthrough pointed at the wrong
// place. Rules are matched instead, so each spec is independent of the others.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { LlmError } from '../../llm/gateway.js';
import type { LlmRequest } from '../../llm/gateway.js';
import type { ScriptedGateway } from '../fakes.js';

/** The learner's latest message as the model sees it (never the STATE block). */
export function latestLearnerText(req: LlmRequest): string {
  for (let i = req.contents.length - 1; i >= 0; i--) {
    const m = req.contents[i];
    if (m?.role !== 'user') continue;
    const texts = m.parts.flatMap((p) => ('text' in p ? [p.text] : []));
    const last = texts[texts.length - 1];
    if (last && !last.startsWith('STATE')) return last;
  }
  return '';
}

/** The quote if the learner really wrote it, else null (the server would reject it anyway). */
export function quoteFrom(req: LlmRequest, phrase: string): string | null {
  return latestLearnerText(req).toLowerCase().includes(phrase.toLowerCase()) ? phrase : null;
}

export type TurnRule = {
  /** What her newest message must contain (matched case-insensitively). */
  when: RegExp;
  /** Buddy's answer; a function sees the whole request (for quotes). */
  answer: (req: LlmRequest) => unknown;
  /**
   * Fails once with "provider down" and works when she sends it again (the tour walks
   * through that). Counted per rule, per process.
   */
  failFirst?: boolean;
};

const rules: TurnRule[] = [];

/** Scenarios add their rules; the order only decides which of two matching rules wins. */
export function scriptTurns(...added: TurnRule[]): void {
  rules.push(...added);
}

/** Forgets every rule (a new dev stack starts clean). */
export function resetTurns(): void {
  rules.length = 0;
}

/** Installs the dispatcher; call it once, after every scenario has added its rules. */
export function installTurns(llm: ScriptedGateway): void {
  const failedOnce = new Set<string>();
  llm.byDefault('buddy_turn', (req: LlmRequest) => {
    const text = latestLearnerText(req);
    const rule = rules.find((r) => r.when.test(text));
    if (!rule) {
      // Loud on purpose: a spec that says something nobody scripted must fail with the
      // sentence it said, not with a wrong answer meant for another spec.
      throw new Error(`no scripted chat answer for: "${text.slice(0, 120)}"`);
    }
    const key = rule.when.source;
    if (rule.failFirst && !failedOnce.has(key)) {
      failedOnce.add(key);
      throw new LlmError('unavailable', 'provider down');
    }
    return rule.answer(req);
  });
}

/** A plain answer that changes nothing. */
export const says = (reply: string, actions: unknown[] = []): ((req: LlmRequest) => unknown) => {
  return () => ({
    lookups: [],
    concern: false,
    actions,
    reply,
    options: null,
    asks_permission: false,
  });
};
