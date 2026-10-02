// What the app measures about her waiting, and the only shape in which it leaves the device
// (issue #169, docs/privacy.md §Device timing). `apps/mobile/lib/perf.ts` measures; this file
// fixes WHAT may be named and in which buckets, so free text can never ride along.

import { z } from 'zod';

import { SessionView } from './learning.js';

/**
 * Every wait the app measures, tap → what she sees. A fixed list on purpose: an unknown action
 * is refused by the API, so a typo or a new mark cannot smuggle text into the database.
 */
export const PerfAction = z.enum([
  /** Send → her bubble stands. */
  'send',
  /** Send → Buddy's first word on screen. */
  'reply',
  /** "Los geht's" on an offer → the first question. */
  'start_offer',
  /** "Jetzt üben" on a practice Buddy prepared (after a photo, a practice, before a test). */
  'start_step',
  /** "Prüfen" → the verdict. */
  'check',
  /** "Weiter" after a verdict → the next question on screen. */
  'next_question',
  /** A question on screen (voice mode) → its first sound. */
  'question_audio',
  /** Her last word in talk mode → Buddy's first sound. */
  'first_audio',
  /** Buddy's last word → the mic listening again. */
  'relisten',
  /** Pronunciation: stop recording → upload done / verdict starts / verdict complete. */
  'speak_finish',
  'speak_wait',
  'speak_total',
]);
export type PerfAction = z.infer<typeof PerfAction>;

/**
 * Things that happened, counted, with no duration: whether what was prepared ahead was what she
 * then needed. That is the other half of "proactive" — what it costs when it was not.
 */
export const PerfCounter = z.enum([
  /** A question's first audio was already fetched when it was read. */
  'speech_ahead_used',
  /** Audio fetched ahead and thrown away unplayed (she left, the question changed). */
  'speech_ahead_wasted',
  /** Her tap on an offer found the practice already prepared (opened from the device). */
  'offer_ready_at_tap',
  /** Her tap on an offer had to wait for the preparation (or start it). */
  'offer_waited_at_tap',
]);
export type PerfCounter = z.infer<typeof PerfCounter>;

/**
 * Upper bounds of the buckets, in ms. A span counts in the first bucket it fits; anything
 * longer than the last one is `0` ("more"). Coarse on purpose: enough for a median and a p90
 * against the budgets of issue #59 (0.5 s, 1 s, 1.5 s), too coarse to be a fingerprint.
 */
export const PERF_BUCKETS_MS = [
  50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000,
] as const;
/** The bucket for spans longer than the last bound. */
export const PERF_BUCKET_MORE = 0;
/** What a counter is stored under (it has no duration). */
export const PERF_BUCKET_COUNTER = -1;

/** The bucket a span of `ms` falls into. */
export function perfBucket(ms: number): number {
  for (const bound of PERF_BUCKETS_MS) if (ms <= bound) return bound;
  return PERF_BUCKET_MORE;
}

const Bucket = z
  .number()
  .int()
  .refine((b) => b === PERF_BUCKET_MORE || (PERF_BUCKETS_MS as readonly number[]).includes(b), {
    message: 'unknown bucket',
  });
/** At most this many spans per action and report — a phone sends a few dozen; more is noise. */
const MAX_PER_ROW = 500;

/** POST /perf: what one app run measured since its last report. No person, no content. */
export const PerfReport = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  build: z.enum(['release', 'dev']),
  spans: z
    .array(
      z.object({
        action: PerfAction,
        bucket_ms: Bucket,
        count: z.number().int().min(1).max(MAX_PER_ROW),
      }),
    )
    .max(PerfAction.options.length * (PERF_BUCKETS_MS.length + 1)),
  counters: z
    .array(z.object({ counter: PerfCounter, count: z.number().int().min(1).max(MAX_PER_ROW) }))
    .max(PerfCounter.options.length)
    .default([]),
});
export type PerfReport = z.infer<typeof PerfReport>;

/**
 * GET /practice/offers/:actionId — whether the practice behind Buddy's offer stands there yet.
 * Asking never prepares anything and never counts as starting it.
 *
 * - `ready`: the session exists (its first questions are stored); `session` is what opening it
 *   shows, so the tap needs no further request.
 * - `preparing`: Buddy is writing it right now. Not ready — the card must not say so (rule 5).
 * - `none`: nothing runs and nothing exists; her tap prepares it as before.
 */
export const OfferReadiness = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ready'), session: SessionView }),
  z.object({ state: z.literal('preparing') }),
  z.object({ state: z.literal('none') }),
]);
export type OfferReadiness = z.infer<typeof OfferReadiness>;
