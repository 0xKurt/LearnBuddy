// How often the app asks whether Buddy's offered practice stands there yet (issue #59,
// GET /practice/offers/:id). Pure, unit-tested; lib/api/queries.ts `useOfferReadiness` uses it.
//
// Asking is cheap (no model call, never starts anything) but not free, so it is bounded: only the
// newest offer asks, every 1.5 s while Buddy prepares it, for at most a minute; an offer nobody
// prepares is asked about a few times (the preparation may start a moment after the reply) and
// then left alone — her tap prepares it as before.

import type { OfferReadiness } from '@learnbuddy/shared-types/contracts';

export const READINESS_EVERY_MS = 1500;
/** Answers of "preparing" before giving up: ~60 s, longer than any measured preparation. */
const MAX_PREPARING = 40;
/** Answers of "none" before giving up: the preparation is claimed right after the reply. */
const MAX_NONE = 3;

/** The wait before asking again, or false to stop asking. `answers` = how many came back. */
export function nextReadinessPoll(
  last: OfferReadiness | undefined,
  answers: number,
): number | false {
  if (!last) return false;
  if (last.state === 'ready') return false;
  if (last.state === 'preparing') return answers < MAX_PREPARING ? READINESS_EVERY_MS : false;
  return answers < MAX_NONE ? READINESS_EVERY_MS : false;
}
