// What Buddy prepares on his own, before she asked (issue #59: "proaktiv statt reaktiv"), kept
// honest in three ways (docs/architecture.md §Proactivity, migration 0105):
//
// 1. **One preparation, not two.** The questions of an offer are written while she reads Buddy's
//    reply (#48). Her tap may land on another server instance than the one writing them; that
//    instance used to see nothing running and asked the model a second time. Now the running
//    preparation is a row, and the tap waits for it (`awaitPreparedAhead`).
// 2. **Measured.** Every preparation she did not ask for records when it started, how it ended and
//    whether she ever used it. A ready preparation nobody used is a model call for nothing.
// 3. **Capped.** Preparing ahead stops when it is mostly thrown away (`speculationAllowed`): then
//    her tap prepares, exactly as before #48. The cap never touches what she asked for herself.
//
// Nothing here tells her anything. "Preparing" is never shown as "ready" (CLAUDE.md rule 5): the
// app asks `offerReadiness`, which says `ready` only once the session row exists.

import type { OfferReadiness } from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { AppError } from '../../lib/errors.js';
import { sessionView } from './service.js';

/**
 * The numbers behind the cap. Fixed and small on purpose; `scripts/perf-report.ts` prints the
 * waste rate they are judged by, so they can be moved on evidence, not on feeling.
 */
export const SPECULATION = {
  /** Preparations ahead per learner in 24 h. A busy afternoon has 3–5 offers. */
  perDay: 8,
  /** Her last offers the waste brake looks at … */
  window: 6,
  /** … of which this many untapped stop preparing ahead. */
  untappedMax: 5,
  /** An offer younger than this may still be tapped: it is not judged yet. */
  settleMinutes: 30,
  /** Offers older than this say nothing about today. */
  windowDays: 14,
  /** A preparation without an end after this long died with its instance. */
  staleSeconds: 120,
} as const;

/** How often and how long her tap looks for a preparation running elsewhere. */
const WAIT_STEP_MS = 250;
const WAIT_STEPS = 240; // 60 s: longer than any measured preparation (7.3 s max, docs/speed-audit.md).

const ago = (now: Date, ms: number) => new Date(now.getTime() - ms);

/**
 * Whether Buddy may prepare an offer before she taps it. `false` means: leave it, her tap
 * prepares it (nothing is lost but the head start).
 */
export async function speculationAllowed(
  db: Db,
  learnerId: string,
  now: Date,
): Promise<{ allowed: boolean; reason: 'per_day' | 'untapped' | null }> {
  const today = await db.one<{ n: number }>(
    `select count(*)::int as n from speculative_preparations
      where learner_id = $1 and started_at > $2`,
    [learnerId, ago(now, 24 * 3_600_000)],
  );
  if (today.n >= SPECULATION.perDay) return { allowed: false, reason: 'per_day' };
  // Her last offers, judged by whether she tapped them: a tap that used a preparation sets
  // `used_at`; a tap on an offer nobody prepared ahead created its session itself. Judged over
  // OFFERS, not over preparations — so the brake lifts the moment she taps again, also while it
  // holds (it would never lift if only prepared offers counted).
  const recent = await db.query<{ tapped: boolean }>(
    `select case when sp.client_request_id is null
                 then exists (select 1 from practice_sessions ps
                               where ps.learner_id = a.learner_id
                                 and ps.client_request_id = a.id)
                 else sp.used_at is not null end as tapped
       from buddy_actions a
       left join speculative_preparations sp
         on sp.learner_id = a.learner_id and sp.client_request_id = a.id
      where a.learner_id = $1 and a.tool = 'offer_learning' and a.status = 'applied'
        and a.created_at <= $2 and a.created_at > $3
      order by a.created_at desc
      limit $4`,
    [
      learnerId,
      ago(now, SPECULATION.settleMinutes * 60_000),
      ago(now, SPECULATION.windowDays * 86_400_000),
      SPECULATION.window,
    ],
  );
  const untapped = recent.filter((r) => !r.tapped).length;
  if (recent.length >= SPECULATION.window && untapped >= SPECULATION.untappedMax) {
    return { allowed: false, reason: 'untapped' };
  }
  return { allowed: true, reason: null };
}

/**
 * Marks a preparation ahead as running. False when one exists already (the same offer twice, or
 * another instance got there first): then nothing is prepared a second time.
 */
export async function claimAhead(
  db: Db,
  learnerId: string,
  requestId: string,
  now: Date,
): Promise<boolean> {
  const rows = await db.query(
    `insert into speculative_preparations (learner_id, client_request_id, kind, started_at)
     values ($1, $2, 'offer', $3)
     on conflict do nothing returning 1`,
    [learnerId, requestId, now],
  );
  return rows.length === 1;
}

/** How a preparation ahead ended. `ready` carries the session it produced. */
export async function finishAhead(
  db: Db,
  learnerId: string,
  requestId: string,
  now: Date,
  outcome: { outcome: 'ready'; sessionId: string } | { outcome: 'refused' | 'failed' },
): Promise<void> {
  await db.query(
    `update speculative_preparations
        set finished_at = $3, outcome = $4, session_id = $5
      where learner_id = $1 and client_request_id = $2 and finished_at is null`,
    [
      learnerId,
      requestId,
      now,
      outcome.outcome,
      outcome.outcome === 'ready' ? outcome.sessionId : null,
    ],
  );
}

/** Her tap used what was prepared ahead (the first tap counts; later ones change nothing). */
export async function markUsed(
  db: Db,
  learnerId: string,
  requestId: string,
  now: Date,
): Promise<void> {
  await db.query(
    `update speculative_preparations set used_at = $3
      where learner_id = $1 and client_request_id = $2 and used_at is null`,
    [learnerId, requestId, now],
  );
}

/**
 * Her tap, while the same offer is being prepared somewhere else: waits for that preparation
 * instead of asking the model again. Returns the session it produced, or null when there is
 * nothing to wait for (no preparation, it failed, or it died) — then the tap prepares itself.
 * A preparation that found nothing to learn is the generator's answer, and it is given to her
 * tap as is: asking again would cost a call for the same "no".
 */
export async function awaitPreparedAhead(
  deps: Deps,
  learnerId: string,
  requestId: string,
): Promise<string | null> {
  for (let step = 0; step < WAIT_STEPS; step++) {
    const row = await deps.db.maybeOne<{
      started_at: Date;
      outcome: 'ready' | 'refused' | 'failed' | null;
      session_id: string | null;
    }>(
      `select started_at, outcome, session_id from speculative_preparations
        where learner_id = $1 and client_request_id = $2`,
      [learnerId, requestId],
    );
    if (!row) return null;
    // The session exists as soon as its first questions are stored — before the preparation
    // has finished writing the rest (issue #220).
    const session = await deps.db.maybeOne<{ id: string }>(
      `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
      [learnerId, requestId],
    );
    if (session) return session.id;
    if (row.outcome === 'refused') {
      throw new AppError('invalid_input', 'Nothing to learn from this', { reason: 'not_usable' });
    }
    if (row.outcome !== null) return null;
    if (row.started_at < ago(deps.now(), SPECULATION.staleSeconds * 1000)) return null;
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS));
  }
  return null;
}

/**
 * What the app may say about an offer right now (GET /practice/offers/:actionId). Never prepares,
 * never counts as her starting it.
 */
export async function offerReadiness(
  deps: Deps,
  learnerId: string,
  actionId: string,
): Promise<OfferReadiness> {
  const session = await deps.db.maybeOne<{ id: string }>(
    `select id from practice_sessions where learner_id = $1 and client_request_id = $2`,
    [learnerId, actionId],
  );
  if (session) {
    return {
      state: 'ready',
      session: await sessionView(deps.db, learnerId, session.id, deps.storage, deps.now()),
    };
  }
  const running = await deps.db.maybeOne(
    `select 1 from speculative_preparations
      where learner_id = $1 and client_request_id = $2 and finished_at is null
        and started_at > $3`,
    [learnerId, actionId, ago(deps.now(), SPECULATION.staleSeconds * 1000)],
  );
  return running ? { state: 'preparing' } : { state: 'none' };
}

/** Retention: what was prepared ahead is measured for 30 days, then forgotten. */
export async function purgeSpeculations(deps: Deps): Promise<number> {
  const gone = await deps.db.query(
    `delete from speculative_preparations
      where ctid in (select ctid from speculative_preparations where started_at <= $1 limit 2000)
      returning 1`,
    [ago(deps.now(), 30 * 86_400_000)],
  );
  return gone.length;
}
