// A talk as a goal with steps, a rehearsal talk and reading a longer text aloud (issue #264,
// docs/architecture.md §Talks and reading aloud).
//
// Buddy carries all of it in the chat: `plan_talk` lays out the steps with days (DaySpec, the
// server resolves them, CLAUDE.md rule 2), and `offer_rehearsal` puts a button in the
// conversation that opens the recorder. What comes back is measured by CODE from the transcript
// and the recorder's clock — duration, words per minute, filler sounds, the words of the text
// she skipped or read differently. The model only transcribes and, for a talk, says per part
// whether it was heard WITH a quote that code finds in the transcript (the rubric rule of #211).

import { z } from 'zod';

import { IsoDateTime, Uuid } from './common.js';

/** The steps of a talk, in the order they are done. */
export const TalkStage = z.enum(['topic', 'outline', 'sources', 'slides', 'rehearsal']);
export type TalkStage = z.infer<typeof TalkStage>;

/** What kind of talk: a Referat, a GFS (Baden-Württemberg), a presentation, a poem recited. */
export const TalkFormat = z.enum(['referat', 'gfs', 'presentation', 'recital']);
export type TalkFormat = z.infer<typeof TalkFormat>;

/** A rehearsal talk is recorded for at most ten minutes, reading aloud for at most two. */
export const REHEARSAL_MAX_MS = { talk: 600_000, read_aloud: 120_000 } as const;
/** Shorter than this is a tap, not a rehearsal. */
export const REHEARSAL_MIN_MS = 3_000;
/**
 * The recording as base64. Ten minutes at the long-recording rate (mono, 24 kbit/s) are about
 * 1.8 MB, 2.4 M characters of base64; the rest is headroom for the browser's own encoder.
 */
export const REHEARSAL_MAX_BASE64 = 2_800_000;

/** A passage to read aloud: long enough to measure a pace, short enough for two minutes. */
export const READ_ALOUD_WORDS = { min: 15, max: 220 } as const;

export const RehearsalKind = z.enum(['talk', 'read_aloud']);
export type RehearsalKind = z.infer<typeof RehearsalKind>;

export const RehearseRequest = z.object({
  client_request_id: Uuid,
  /** The button she tapped: Buddy's `offer_rehearsal` in the conversation. */
  action_id: Uuid,
  mime: z.enum(['audio/mp4', 'audio/aac', 'audio/m4a', 'audio/webm', 'audio/wav', 'audio/mpeg']),
  audio_base64: z.string().min(100).max(REHEARSAL_MAX_BASE64),
  /** How long the recording ran, by the recorder's own clock. */
  duration_ms: z.number().int().min(REHEARSAL_MIN_MS).max(REHEARSAL_MAX_MS.talk),
});
export type RehearseRequest = z.infer<typeof RehearseRequest>;

export const TalkPart = z.enum(['opening', 'main', 'closing']);
export type TalkPart = z.infer<typeof TalkPart>;

/**
 * One part of the talk: heard (the model quoted it and the quote is in the transcript),
 * not_heard (the model said it was missing), unknown (nothing that could be checked). Never a
 * score — the parts stand as "da" / "noch nicht", like the writing rubric (#211).
 */
export const TalkPartView = z.object({
  part: TalkPart,
  status: z.enum(['heard', 'not_heard', 'unknown']),
});
export type TalkPartView = z.infer<typeof TalkPartView>;

export const RehearsalView = z.object({
  id: Uuid,
  kind: RehearsalKind,
  duration_s: z.number().int(),
  /** The length she was asked for (a talk with a known length), else null. */
  target_s: z.number().int().nullable(),
  words: z.number().int(),
  words_per_minute: z.number().int(),
  /** Talk: how many filler sounds ("äh", "ähm") the transcript holds. Null for reading aloud. */
  fillers: z.number().int().nullable(),
  /** Reading aloud: words of the text she left out, in text order (at most 20). */
  skipped: z.array(z.string()).max(20),
  /** Reading aloud: words of the text she read as something else (at most 20). */
  misread: z.array(z.string()).max(20),
  /** Talk: whether an opening, a main part and a closing were heard. Null for reading aloud. */
  structure: z.array(TalkPartView).nullable(),
  /** The talk's rehearsal step is now done, with this rehearsal as its evidence. */
  step_done: z.boolean(),
  created_at: IsoDateTime,
});
export type RehearsalView = z.infer<typeof RehearsalView>;

/** What the recorder screen needs to show before she starts (GET /voice/rehearse/:action). */
export const RehearsalBrief = z.object({
  action_id: Uuid,
  kind: RehearsalKind,
  /** The talk's title, or the first words of the passage. */
  title: z.string(),
  /** Reading aloud: the passage, exactly as it will be compared. */
  text: z.string().nullable(),
  /** Talk: the length she was asked for, in minutes, when known. */
  minutes: z.number().int().nullable(),
  /** The longest recording this kind takes. */
  max_s: z.number().int(),
});
export type RehearsalBrief = z.infer<typeof RehearsalBrief>;
