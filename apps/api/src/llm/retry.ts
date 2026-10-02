// Surviving a short outage or throttle inside ONE model call (issues #167, #206).
//
// The gateway's own note said "no retries here: callers decide whether an error is worth
// retrying later". For background work that is right — a job runs again. For a turn in a
// conversation there is no later: `turn.ts` marks the message failed and the child reads
// "Buddy konnte gerade nicht antworten". One extra attempt after a short pause catches a
// single 503 without anyone noticing (#167).
//
// 01.10.2026 added the second case, and it reverses part of that decision. Between 20:26
// and 20:39 MESZ every Vertex model in the project answered 429 RESOURCE_EXHAUSTED — 3.6,
// 3.7 and 3.5 Flash, 3.1 Flash-Lite in `eu`, 2.5 Flash in europe-west4 — even for a single
// trivial prompt (#206). #167 had deliberately left 429 out, reasoning that a quota is not
// bought back by a pause of 350 ms. That holds for a project quota and misses the case the
// owner hit: Vertex's dynamic shared quota is capacity borrowed per moment from a pool
// shared with other customers, so the next second can be free while this one is not. 429
// therefore gets two more attempts.
//
// The hard part is that this must not cost the child time she did not already risk, so the
// retries live INSIDE the budget the caller set (`generateWithRetries` below). Before this
// change two attempts could take twice the caller's `timeoutMs`; now three cannot exceed it.
//
// What this is still NOT: a cure for being out of quota. When the throttle lasts minutes,
// every attempt fails and she gets the honest "geht gerade nicht" (rule 5). The call is
// then recorded with `error_code = 'rate_limited'` in `llm_calls` and the scheduler alarms
// on the rate (`modules/scheduler/throttle.ts`) — the fix for that lives in the Cloud
// Console, not here.

import { LlmError, type LlmRequest, type LlmResult } from './gateway.js';

/**
 * How many attempts a failure of this kind is worth IN TOTAL, the first one included.
 *
 * Everything not listed answers the same way twice — a refusal, a safety block, unusable
 * output — and a `timeout` has already spent the whole budget, so there is nothing left to
 * spend on a repeat.
 */
export function attemptsFor(err: unknown): number {
  if (!(err instanceof LlmError)) return 1;
  switch (err.kind) {
    // The provider was unreachable or answered 5xx: the next second may well work (#167).
    case 'unavailable':
      return 2;
    // Throttled: shared capacity can free up within a second or two (#206).
    case 'rate_limited':
      return 3;
    default:
      return 1;
  }
}

/** The pause before the second attempt. */
export const RETRY_PAUSE_MS = 350;
/** Each further pause is this many times the one before it (exponential backoff). */
export const RETRY_PAUSE_FACTOR = 3;
/**
 * The share of a pause that is random. Concurrent callers hit the same throttle at the
 * same moment; without jitter they would all come back in lockstep and throttle each
 * other again.
 */
export const RETRY_JITTER_RATIO = 0.5;
/**
 * The least an attempt may have left of the budget to be worth starting at all: Buddy's
 * measured reply budget (docs/architecture.md §Speed). With less than this left, an
 * attempt can only end in the timeout it was handed.
 */
export const MIN_ATTEMPT_MS = 3_000;

/**
 * The pause after `attemptsDone` failed attempts: 350–525 ms, then 1 050–1 575 ms. At
 * worst ~2.1 s of extra waiting before the honest failure — #59 is already open about
 * slowness, so this stays in the range a child reads as "it's thinking", not as "it hangs".
 */
export function retryPauseMs(attemptsDone: number, random: () => number): number {
  const base = RETRY_PAUSE_MS * RETRY_PAUSE_FACTOR ** (attemptsDone - 1);
  return Math.round(base * (1 + random() * RETRY_JITTER_RATIO));
}

/**
 * The three things the retry needs from outside, injected so a test proves the schedule
 * without sleeping through it.
 *
 * `elapsedMs` is NOT the app clock (`deps.now()`, rule 7) and must not be: it measures how
 * much of THIS request's own timeout is gone — the very thing `AbortSignal.timeout`
 * measures — and never decides anything about a stored row. A monotonic counter is used so
 * a clock correction mid-call cannot stretch or shrink the budget.
 */
export type RetryWaits = {
  elapsedMs: () => number;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
};

export const REAL_WAITS: RetryWaits = {
  elapsedMs: () => performance.now(),
  sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
  random: Math.random,
};

/**
 * One structured answer, retried inside the caller's own timeout.
 *
 * How the budget is divided: `req.timeoutMs` is the budget for EVERYTHING — the first
 * attempt, the pauses, and every retry. The first attempt may use all of it; shortening it
 * would fail calls that succeed today, which is the opposite of the point. A retry gets
 * exactly what is left after its pause, and only starts when at least `MIN_ATTEMPT_MS`
 * remain. So this returns within roughly `timeoutMs` whether it tried once or three times,
 * and a 429 that comes back slowly simply leaves no room for a second try — which is
 * correct: the budget is the child's patience, not the provider's.
 *
 * A streamed call that already handed text to `onPartial` is never retried: she would
 * watch a sentence be replaced by another one.
 */
export async function generateWithRetries(
  req: LlmRequest,
  attempt: (req: LlmRequest, timeoutMs: number) => Promise<LlmResult>,
  waits: RetryWaits = REAL_WAITS,
): Promise<LlmResult> {
  const deadline = waits.elapsedMs() + req.timeoutMs;
  // Per CALL, not per gateway: one gateway instance serves every request at once, so a
  // field there would let one streamed answer suppress every other call's retry — and
  // never reset.
  let handedOut = false;
  const watched: LlmRequest = req.onPartial
    ? {
        ...req,
        onPartial: (text) => {
          // From here on she has seen words: a second attempt would replace them.
          handedOut = true;
          req.onPartial?.(text);
        },
      }
    : req;
  let attemptsDone = 0;
  for (;;) {
    const left = deadline - waits.elapsedMs();
    try {
      return await attempt(watched, Math.max(Math.round(left), 0));
    } catch (err) {
      attemptsDone++;
      if (handedOut || attemptsDone >= attemptsFor(err)) throw err;
      const pause = retryPauseMs(attemptsDone, waits.random);
      // No room for the pause AND an attempt that could finish: give up honestly now
      // instead of burning what is left of her patience on a call that cannot land.
      if (deadline - waits.elapsedMs() - pause < MIN_ATTEMPT_MS) throw err;
      await waits.sleep(pause);
    }
  }
}
