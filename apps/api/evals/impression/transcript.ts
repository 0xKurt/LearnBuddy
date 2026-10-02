// What one side of the overall-impression comparison writes down (issue #127): every
// conversation of every scenario, turn by turn, with what Buddy said, what he did, whether he
// asked back, and what the turn cost in tokens and time. The judge reads two of these.
// requires live verification in Claude Code session (written by the live-model runner run.ts)

import { z } from 'zod';

export const Turn = z.object({
  /** What she said. */
  said: z.string(),
  status: z.enum(['done', 'processing', 'failed']),
  errorCode: z.string().nullable(),
  /** Buddy's answer as stored; null when the turn produced none. */
  reply: z.string().nullable(),
  /** The suggestion buttons under the answer, in his words. */
  options: z.array(z.string()),
  /** What the turn DID (buddy_actions), in order. */
  tools: z.array(z.string()),
  /** The model said this turn asks her for permission before doing something. */
  asks: z.boolean(),
  /** Wall clock from her message to the stored answer, through the real app. */
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative(),
});
export type Turn = z.infer<typeof Turn>;

export const Conversation = z.object({
  scenario: z.string(),
  /** 0-based run index of this scenario. */
  run: z.number().int().nonnegative(),
  turns: z.array(Turn).min(1),
});
export type Conversation = z.infer<typeof Conversation>;

export const ImpressionRun = z.object({
  kind: z.literal('impression-run'),
  /** What is compared: the prompt version the code carried… */
  promptVersion: z.string(),
  /** …and the git revision it ran from (the label in the report; never shown to the judge). */
  revision: z.string(),
  ranAt: z.string(),
  models: z.array(z.string()),
  runsPerScenario: z.number().int().positive(),
  conversations: z.array(Conversation),
});
export type ImpressionRun = z.infer<typeof ImpressionRun>;
