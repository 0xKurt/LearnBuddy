// One short second chance for a model call (issue #167).
//
// The gateway's own note said "no retries here: callers decide whether an error is worth
// retrying later". For background work that is right — a job runs again. For a turn in a
// conversation there is no later: `turn.ts` marks the message failed and the child reads
// "Buddy kann gerade nicht antworten". One extra attempt after a short pause catches a
// single 503 without anyone noticing.
//
// What this is NOT: a retry loop, and not a cure for being out of quota. A child is
// waiting; three attempts over several seconds are worse for her than an honest "geht
// gerade nicht" (rule 5), and worse than the slowness she already complains about (#59).

import { LlmError } from './gateway.js';

/** How long to wait before the second attempt, and how much to spread it. */
export const RETRY_AFTER_MS = 350;
export const RETRY_JITTER_MS = 250;

/**
 * Whether a failed attempt is worth repeating AT ONCE.
 *
 * Only `unavailable`: the provider was unreachable or answered 5xx, and the next second
 * may well work. Everything else answers the same way twice — a refusal, a safety block,
 * unusable output — and repeating it costs the child time and the project money.
 *
 * `rate_limited` (429) is deliberately out, and that is the lesson of 01.10.: a 429 means
 * the project is over its quota for that model, which a pause of 350 ms does not change.
 * Google's own client already backs off and retries inside the call (a 3.8 probe that day
 * answered after 229 seconds), so a retry here would stack a second long wait on top of
 * the first. The app's 30 s timeout is what protects the child there, not another attempt.
 *
 * `timeout` is out for the same kind of reason: the call already spent its whole budget,
 * and starting the same wait again is the opposite of what a waiting child needs.
 */
export function worthASecondTry(err: unknown): boolean {
  return err instanceof LlmError && err.kind === 'unavailable';
}

/** The pause before the second attempt: short, and spread so a fleet does not sync up. */
export function retryDelayMs(random: () => number): number {
  return RETRY_AFTER_MS + Math.floor(random() * RETRY_JITTER_MS);
}
