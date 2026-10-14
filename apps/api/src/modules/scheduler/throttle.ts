// Is the model provider throttling us? docs/architecture.md §Model calls (issue #206).
//
// Measured 01.10.2026, 20:26–20:39 MESZ: every Vertex model in the project answered
// 429 RESOURCE_EXHAUSTED, even for a single trivial prompt, and one Buddy answer took 110 s
// with retries. Afterwards nothing in the app said so — the live app had no traffic in those
// minutes, so `llm_calls` held no row, and a throttle of that shape is invisible the moment
// it stops. It hits the learner directly (every attempt fails, the turn is marked failed),
// and the fix is a quota in the Cloud Console, not code — which only helps if someone is told.
//
// So the tick measures the share of model calls the provider refused with a 429 over the
// last hour and, above the threshold, puts the measured rate into the run's errors. That is
// the channel this project already uses to reach the operator: it becomes the scheduler's
// `last_error`, which makes `GET /health` answer 503 and show the line (audit S-5). The next
// clean tick clears it again, so the alarm follows the throttle instead of outliving it.
//
// What it cannot see: a throttle that the provider's own client swallows into a long internal
// backoff until the app's timeout fires. That call is recorded as `timeout`, because that is
// all we can honestly know about it (rule 5) — so this rate is a floor, never a ceiling.

import type { Db } from '../../lib/db.js';

/**
 * The window the rate is measured over. An hour is long enough to hold enough calls for a
 * share to mean something (one learner's afternoon is tens of calls, not thousands) and
 * short enough that a throttle is usually still happening when the alarm is read.
 */
export const THROTTLE_WINDOW_MINUTES = 60;

/**
 * How many calls the window needs before a share is raised as an alarm. Below this, a single
 * 429 reads as 50 % or 100 % and says nothing about the provider.
 */
export const THROTTLE_MIN_CALLS = 20;

/**
 * The share of refused calls that raises the alarm.
 *
 * Not "how much is acceptable": the expected share is zero, since 429 is not a normal
 * operating condition for this project. The number answers "more than one unlucky moment" —
 * together with THROTTLE_MIN_CALLS it takes at least two refused calls out of twenty. It is
 * low enough to fire long before the episode of 01.10. (every probe refused for 13 minutes,
 * i.e. 100 %) turns into 13 minutes of a child reading "Buddy konnte gerade nicht
 * antworten", and high enough that one 429 in a quiet hour does not cry wolf.
 */
export const THROTTLE_ALARM_PERCENT = 10;

export type ModelThrottle = {
  /** Model calls recorded in the window — every purpose, embeddings included. */
  calls: number;
  /** Of those, the ones the provider refused with a 429 (`error_code = 'rate_limited'`). */
  rate_limited: number;
  /** `rate_limited / calls` in percent, one decimal; 0 when the window held no call. */
  percent: number;
  window_minutes: number;
  /** Over the threshold, with enough calls behind it to mean it. */
  alarming: boolean;
};

export async function modelThrottle(db: Db, now: Date): Promise<ModelThrottle> {
  // Both boundaries come from the app clock and are passed in: SQL never decides "recent"
  // with now() (rule 7). The upper one matters — a row whose timestamp lies ahead of the app
  // clock (a skewed database clock, or the embedding rows that still take the column default)
  // is not something that happened in the last hour, and counting it would move the rate.
  // The existing llm_calls_created_idx serves the range.
  const since = new Date(now.getTime() - THROTTLE_WINDOW_MINUTES * 60_000);
  // `error_code` is exactly the error kind for a throttle: classify() builds a rate-limited
  // error without a finish reason, so call.ts writes 'rate_limited' and nothing appended.
  const row = await db.maybeOne<{ calls: number; limited: number }>(
    `select count(*)::int as calls,
            count(*) filter (where error_code = 'rate_limited')::int as limited
       from llm_calls where created_at >= $1 and created_at <= $2`,
    [since, now],
  );
  const calls = row?.calls ?? 0;
  const limited = row?.limited ?? 0;
  const percent = calls === 0 ? 0 : Math.round((1000 * limited) / calls) / 10;
  return {
    calls,
    rate_limited: limited,
    percent,
    window_minutes: THROTTLE_WINDOW_MINUTES,
    alarming: calls >= THROTTLE_MIN_CALLS && percent >= THROTTLE_ALARM_PERCENT,
  };
}

/** The alarm, with the numbers it was raised on — never "something seems slow". */
export function throttleAlarm(t: ModelThrottle): string {
  return (
    `model throttled: the provider refused ${t.rate_limited} of ${t.calls} model calls ` +
    `with 429 in the last ${t.window_minutes} min (${t.percent} %, alarm at ` +
    `${THROTTLE_ALARM_PERCENT} %) — check the Vertex quota for this project`
  );
}

// Refused and unusable answers, per purpose (issue #650, audit F2-b). From 03.10. to 14.10.2026
// every practice run, test, help and sheet reading was refused with a bare 400 because its schema
// had grown past what Vertex serves (#627) — eleven days, and nothing here said so, because this
// file counted only 429s. A 400 is no throttle: the request itself is wrong, the same request
// fails the same way, and only a code change helps. So it is counted per purpose — one purpose
// failing completely is drowned in the share of all calls when the chat keeps working — together
// with answers that came back unusable (`invalid_output`: cut off, empty, not JSON), the other
// shape a broken prompt or schema takes.

/**
 * Failed calls of one purpose before its share is raised as an alarm. One refusal in a quiet hour
 * can be one odd request; two mean the same thing happened again.
 */
export const FAILURE_MIN_FAILED = 2;

/**
 * The share of a purpose's calls that may fail before the alarm. A broken schema fails every call
 * of its purpose (100 %); a model that cuts off long sheets now and then stays well under it.
 */
export const FAILURE_ALARM_PERCENT = 25;

export type PurposeFailures = {
  purpose: string;
  calls: number;
  /** The provider rejected the request itself (`error_code` 'refused…', HTTP 4xx other than 429). */
  refused: number;
  /** The answer came back unusable (`outcome = 'invalid_output'`). */
  invalid_output: number;
  /** `(refused + invalid_output) / calls` in percent, one decimal. */
  percent: number;
  alarming: boolean;
};

/** Per purpose with any call in the window, the most failing first. */
export async function modelFailures(db: Db, now: Date): Promise<PurposeFailures[]> {
  // Same window and the same app-clock boundaries as the throttle above (rule 7).
  const since = new Date(now.getTime() - THROTTLE_WINDOW_MINUTES * 60_000);
  const rows = await db.query<{
    purpose: string;
    calls: number;
    refused: number;
    invalid: number;
  }>(
    `select purpose, count(*)::int as calls,
            count(*) filter (where error_code like 'refused%')::int as refused,
            count(*) filter (where outcome = 'invalid_output')::int as invalid
       from llm_calls where created_at >= $1 and created_at <= $2
      group by purpose`,
    [since, now],
  );
  return rows
    .map((r) => {
      const failed = r.refused + r.invalid;
      const percent = Math.round((1000 * failed) / r.calls) / 10;
      return {
        purpose: r.purpose,
        calls: r.calls,
        refused: r.refused,
        invalid_output: r.invalid,
        percent,
        alarming: failed >= FAILURE_MIN_FAILED && percent >= FAILURE_ALARM_PERCENT,
      };
    })
    .sort((a, b) => b.percent - a.percent || a.purpose.localeCompare(b.purpose));
}

/** One purpose's alarm, with its numbers and where to look. */
export function failureAlarm(f: PurposeFailures): string {
  return (
    `model calls failing: ${f.purpose} — ${f.refused} refused and ${f.invalid_output} unusable ` +
    `of ${f.calls} calls in the last ${THROTTLE_WINDOW_MINUTES} min (${f.percent} %, alarm at ` +
    `${FAILURE_ALARM_PERCENT} %) — a refused request is the code's (schema, prompt or arguments), ` +
    `not the provider's quota`
  );
}
