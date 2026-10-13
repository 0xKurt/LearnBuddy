// The fixed help answer in the browser walkthrough (CLAUDE.md rule 18, #599 correction): until
// now every scripted answer said `concern: false`, so no spec could walk the one answer that must
// never be cut — on the conversation screen its phone number stood below the visible lines.
//
//   · in the chat: she writes the sentence below, and the scripted model sets `concern`;
//   · on the conversation screen the fake microphone always says the same sentence
//     (`roleplay.ts`), so the learner decides instead: a child called `DISTRESS_NAME` gets the
//     concern answer to it, every other learner the ordinary one (`learning-modes.ts`).
//
// The words she then reads are the server's own (`i18n/safeguarding.ts`), never the script's.
//
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import type { LlmRequest } from '../../llm/gateway.js';
import { scriptTurns } from './turns.js';

/** What she writes in the chat to tell of distress. */
export const DISTRESS_TEXT = 'In der Schule werde ich jeden Tag gehauen';

/** The spoken walkthrough's learner whose one sentence is answered as a concern. */
export const DISTRESS_NAME = 'Mila';

/** The model's decision for distress: the reply stays empty, code writes the answer. */
export const concern = (): unknown => ({
  lookups: [],
  concern: true,
  also_asked: false,
  actions: [],
  reply: '',
  options: null,
  asks_permission: false,
});

/** Whether the turn is `DISTRESS_NAME`'s (her name stands in the STATE block's learner line). */
export function fromDistressLearner(req: LlmRequest): boolean {
  const said = req.contents.flatMap((m) => m.parts.flatMap((p) => ('text' in p ? [p.text] : [])));
  return [req.system, ...said].some((text) => text.includes(`Name: ${DISTRESS_NAME} ·`));
}

export function scriptSafeguarding(): void {
  scriptTurns({ when: /werde ich jeden tag gehauen/i, answer: concern });
}
