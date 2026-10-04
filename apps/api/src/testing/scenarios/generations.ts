// Prepared practice for the browser walkthrough, chosen by **what was asked for** — not by
// the order the specs happen to run in (issue #81, second half).
//
// Chat answers were made text-keyed first (turns.ts); the generation of questions stayed a
// queue, and it drifted for the same reason: Buddy now prepares an offered practice in the
// background (#48), so *when* a generation happens depends on timing. One spec taking a
// moment longer shifted the queue for every spec after it — three specs failed at
// "the question does not appear" while nothing was actually broken.
//
// Rules match the request the server sends (it carries LEARNER'S TEXT, the subject and, for
// a photographed sheet, its text), so every spec is independent of the others.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { ScriptedGateway } from '../fakes.js';
import { RuleBook, type Rule } from './rules.js';

export type GenerationRule = Rule;

// Loud on purpose: a spec that asks for something nobody scripted must fail with what it
// asked for, not with a set of questions meant for another spec.
const book = new RuleBook('explain', (_req, text) => {
  const asked = /LEARNER'S TEXT:\n([^\n]+)/.exec(text)?.[1] ?? text.slice(0, 120);
  throw new Error(`no scripted practice for: "${asked}"`);
});

/** Scenarios add their rules; the order only decides which of two matching rules wins. */
export function scriptGenerations(...added: GenerationRule[]): void {
  book.add(...added);
}

/** Installs the dispatcher; call it once, after every scenario has added its rules. */
export function installGenerations(llm: ScriptedGateway): void {
  book.install(llm);
}
