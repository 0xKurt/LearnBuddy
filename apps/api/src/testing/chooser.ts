// What the scripted gateway (fakes.ts) needs to answer a domain's choice step: the learning domain's
// form and figure choice before a main call (#627, modules/practice/formChoice.ts). A domain fills it
// in its test setup (testing/domain.ts, vitest.config.ts `setupFiles`); a Buddy without one has no
// choice step, and its main calls go out whole (issue #107).
// requires live verification in Claude Code session (paired with a real Postgres)

import type { JsonSchema, LlmPurpose, LlmRequest } from '../llm/gateway.js';

type Lists = { forms: string[]; figures: string[] };

export type FakeChooser = {
  /** This request is the choice step. */
  isChoosing(req: LlmRequest): boolean;
  /** The main call a choice is for, by its purpose; null when it is for none. */
  chosenFor(req: LlmRequest): LlmPurpose | null;
  /** What an answer uses. */
  usedBy(answer: unknown): Lists;
  /** What a schema offers to choose from. */
  offered(schema: JsonSchema): Lists;
  /** The schema narrowed to what fits of `wanted`. */
  fitted(schema: JsonSchema, wanted: Lists): { schema: JsonSchema };
};

let chooser: FakeChooser | null = null;

export function setFakeChooser(c: FakeChooser): void {
  chooser = c;
}

export function fakeChooser(): FakeChooser | null {
  return chooser;
}
