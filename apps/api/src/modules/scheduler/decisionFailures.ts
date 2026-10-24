// Final learner outcomes, separate from provider calls. docs/architecture.md §Background work.
import type { Db } from '../../lib/db.js';
import { ERROR_STATUS } from '../../lib/errors.js';
import { FAILURE_ALARM_PERCENT, FAILURE_MIN_FAILED, THROTTLE_WINDOW_MINUTES } from './throttle.js';

const TURN_CODES = ['invalid', 'model_unavailable', 'internal', 'budget'];
const OFFER_CODES = ['not_usable', 'speech_off', ...Object.keys(ERROR_STATUS)];

function rate(failed: number, total: number) {
  return {
    percent: total === 0 ? 0 : Math.round((1000 * failed) / total) / 10,
    // Compare the unrounded share, so 24.96% cannot trip a 25% threshold.
    alarming: failed >= FAILURE_MIN_FAILED && 100 * failed >= FAILURE_ALARM_PERCENT * total,
  };
}

type MessageCounts = {
  messages: number;
  failed: number;
  stopped: number;
  blocked: number;
  protected: number;
};
type AttemptCounts = {
  rejected_attempts: number;
  repaired_messages: number;
  background_decisions: number;
  background_rejected: number;
  background_failed: number;
  background_protected: number;
};
type OfferCounts = { total: number; failed: number; permanent: number };

/** No joins can multiply the learner-message denominator. All boundaries use the app clock. */
export async function decisionFailures(db: Db, now: Date) {
  const since = new Date(now.getTime() - THROTTLE_WINDOW_MINUTES * 60_000);
  const day = new Date(now.getTime() - 24 * 60 * 60_000);
  // One scan/round trip for both windows keeps an idle tick within its 40-query budget.
  const { code_counts: top, ...messages } = await db.one<
    MessageCounts & { code_counts: Array<{ code: string; count: number }> }
  >(
    `with recent as (
       select status, failure_code, recall_block, created_at from buddy_messages
       where role='learner' and created_at >= $4 and created_at <= $2
     ), codes as (
       select failure_code as code, count(*)::int as count from recent
       where status='failed' and recall_block is null and failure_code=any($3::text[])
       group by failure_code
     ) select count(*)::int as messages,
       count(*) filter (where status='failed' and failure_code=any($3::text[]) and recall_block is null)::int as failed,
       count(*) filter (where failure_code='stopped')::int as stopped,
       count(*) filter (where failure_code='blocked' or recall_block='blocked')::int as blocked,
       count(*) filter (where recall_block='concern')::int as protected,
       (select coalesce(jsonb_agg(codes), '[]'::jsonb) from codes) as code_counts
     from recent where created_at >= $1`,
    [since, now, TURN_CODES, day],
  );
  const attempts = await db.one<AttemptCounts>(
    `with recent as (
       select d.mode, d.disposition, d.trigger_message_id,
         exists (select 1 from jsonb_array_elements_text(
           case when jsonb_typeof(d.errors)='array' then d.errors else '[]'::jsonb end
         ) e where e='blocked' or e like 'blocked:%') as protective
       from buddy_decisions d where d.created_at >= $1 and d.created_at <= $2
     ) select
       count(*) filter (where mode='turn' and disposition='rejected')::int as rejected_attempts,
       count(distinct trigger_message_id) filter (where mode='turn' and disposition='rejected'
         and exists (select 1 from buddy_messages m where m.id=trigger_message_id
           and m.role='learner' and m.status='done' and m.failure_code is null
           and m.recall_block is null))::int as repaired_messages,
       count(*) filter (where mode='check')::int as background_decisions,
       count(*) filter (where mode='check' and disposition='rejected' and not protective)::int as background_rejected,
       count(*) filter (where mode='check' and disposition='failed' and not protective)::int as background_failed,
       count(*) filter (where mode='check' and protective)::int as background_protected
     from recent`,
    [since, now],
  );
  // The action's creation time is NOT the failure time: background preparation or a tap may
  // fail hours later. One latest failure per action prevents repeated taps inflating the rate.
  // Legacy permanent offers lack a reason: retain the timestamp, never infer one from text.
  const offerRows = await db.query<{
    code: string;
    failed_at: Date | null;
    created_at: Date;
    permanent: boolean;
  }>(
    `select case when result #>> '{offer_failure,code}' = any($3::text[])
                   then result #>> '{offer_failure,code}' else 'unknown' end as code,
       coalesce((result #>> '{offer_failure,at}')::timestamptz, cannot_start_at) as failed_at,
       created_at, cannot_start_at is not null as permanent
     from buddy_actions a where tool='offer_learning'
       and ((created_at >= $1 and created_at <= $2)
         or (coalesce((result #>> '{offer_failure,at}')::timestamptz, cannot_start_at) >= $1
           and coalesce((result #>> '{offer_failure,at}')::timestamptz, cannot_start_at) <= $2))`,
    [day, now, OFFER_CODES],
  );
  const inHour = (date: Date | null) => date !== null && date >= since && date <= now;
  const offerCounts: OfferCounts = { total: 0, failed: 0, permanent: 0 };
  const codes: Record<string, number> = {};
  for (const offer of offerRows) {
    if (inHour(offer.created_at) || inHour(offer.failed_at)) offerCounts.total++;
    if (offer.failed_at === null || offer.failed_at < day || offer.failed_at > now) continue;
    top.push({ code: `offer_${offer.code}`, count: 1 });
    if (!inHour(offer.failed_at)) continue;
    offerCounts.failed++;
    if (offer.permanent) offerCounts.permanent++;
    codes[offer.code] = (codes[offer.code] ?? 0) + 1;
  }
  const totals = new Map<string, number>();
  for (const entry of top) totals.set(entry.code, (totals.get(entry.code) ?? 0) + entry.count);
  return {
    ...messages,
    ...rate(messages.failed, messages.messages),
    window_minutes: THROTTLE_WINDOW_MINUTES,
    rejected_attempts: attempts.rejected_attempts,
    repaired_messages: attempts.repaired_messages,
    background: {
      decisions: attempts.background_decisions,
      rejected: attempts.background_rejected,
      failed: attempts.background_failed,
      protected: attempts.background_protected,
    },
    offers: { ...offerCounts, ...rate(offerCounts.permanent, offerCounts.total), codes },
    top_codes_24h: [...totals]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
      .slice(0, 3),
  };
}

export type DecisionFailures = Awaited<ReturnType<typeof decisionFailures>>;

export function decisionFailureAlarms(f: DecisionFailures): string[] {
  const alarms: string[] = [];
  if (f.alarming)
    alarms.push(
      `decision failures: ${f.failed} of ${f.messages} learner messages in the last ${f.window_minutes} min (${f.percent} %)`,
    );
  if (f.offers.alarming)
    alarms.push(
      `offer failures: ${f.offers.permanent} of ${f.offers.total} offers permanently unpreparable in the last ${f.window_minutes} min (${f.offers.percent} %)`,
    );
  return alarms;
}
