import { z } from 'zod';

import { AnswerMode, Iso8601, Uuid, Verdict } from './enums.js';
import { Item } from './item.js';

// One message in a learning session's conversation thread.
// Canonical source: docs/06-ai-pipeline.md §P3, migration 0017.
export const ConversationRole = z.enum(['learner', 'tutor', 'system']);
export type ConversationRole = z.infer<typeof ConversationRole>;

export const ConversationTurnKind = z.enum([
  'question',
  'answer',
  'hint',
  'feedback',
  'reveal',
  'note',
]);
export type ConversationTurnKind = z.infer<typeof ConversationTurnKind>;

export const ConversationTurn = z.object({
  id: Uuid,
  session_id: Uuid,
  item_id: Uuid.nullable(),
  turn_index: z.number().int().nonnegative(),
  role: ConversationRole,
  kind: ConversationTurnKind,
  content: z.string(),
  verdict: Verdict.nullable(),
  mode: AnswerMode.nullable(),
  client_turn_id: Uuid.nullable(),
  created_at: Iso8601,
});
export type ConversationTurn = z.infer<typeof ConversationTurn>;

// What the mobile client posts to POST /sessions/:id/turn.
// Exactly one of `text` / `audio_base64` must be present. When audio is
// sent the server transcribes it (Gemini) so voice works regardless of any
// native on-device recognizer — docs/06-ai-pipeline.md §voice.
export const SessionTurnRequest = z
  .object({
    client_turn_id: Uuid,
    item_id: Uuid.nullable(),
    mode: AnswerMode,
    text: z.string().max(4000).nullable().optional(),
    audio_base64: z.string().max(8_000_000).nullable().optional(),
    audio_mime: z.enum(['audio/m4a', 'audio/mp4', 'audio/wav', 'audio/webm']).nullable().optional(),
    duration_ms: z.number().int().nonnegative().default(0),
    test_mode: z.boolean().default(false),
    // Local evaluator was confident the answer is correct → skip the LLM and
    // record the turn for free (docs/08-cost-and-credits.md).
    client_local_verdict: z.enum(['correct']).nullable().optional(),
  })
  .refine((v) => Boolean(v.text?.trim()) || Boolean(v.audio_base64), {
    message: 'Either text or audio_base64 is required',
  });
export type SessionTurnRequest = z.infer<typeof SessionTurnRequest>;

// Streaming SSE envelope from POST /sessions/:id/turn. The tutor reply is
// streamed token-by-token so the chat bubble fills in live; terminal events
// carry the persisted ids and credit cost.
export const ConversationSseEvent = z.discriminatedUnion('type', [
  // The server's transcription of a voice turn (so the UI can show what it
  // heard before the tutor answers).
  z.object({ type: z.literal('transcript'), text: z.string() }),
  // Incremental tutor reply text.
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({ type: z.literal('verdict'), verdict: Verdict }),
  z.object({ type: z.literal('hint'), text: z.string() }),
  // Full tutor feedback text (final, in case the client did not accumulate
  // tokens — keeps non-streaming clients correct).
  z.object({ type: z.literal('feedback'), text: z.string() }),
  z.object({
    type: z.literal('done'),
    credits_used: z.number().int().nonnegative(),
    verdict: Verdict,
    learner_turn_id: Uuid,
    tutor_turn_id: Uuid,
    // True while the session still has items / the learner asked to keep
    // going; false once it has naturally ended.
    session_active: z.boolean(),
  }),
  z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type ConversationSseEvent = z.infer<typeof ConversationSseEvent>;

// Full session snapshot for deterministic resume — same items, full thread.
export const SessionSnapshot = z.object({
  session_id: Uuid,
  test_mode: z.boolean(),
  pinned_topic: z.string().nullable(),
  active: z.boolean(),
  items: z.array(Item),
  turns: z.array(ConversationTurn),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;
