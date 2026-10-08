// Buddy offers a review on his own (issue #446): two moments, decided by code from data, never by
// the model (CLAUDE.md rule 1). docs/architecture.md §Proactivity.
//
// "Am Tag danach" (`review_next_day`): the day after a sheet was read, go over it once more.
// Retrieval after a night's sleep is the strongest lever for keeping what was learned (spacing,
// the testing effect), and a notebook entry is exactly what the next lesson builds on.
//   * scheduled once per sheet when its reading is done (`material_ready`, events.ts), for the
//     start of her preferred window the next day, in her zone; homework never (no event);
//   * when it runs: the sheet is still hers, read and not deleted; she has not answered any of
//     its questions today and no open practice holds them; the wake-up runs on its own day.
//
// "Nach einer Pause" (`review_due`): after a break, what has fallen due is refreshed before it
// slips away.
//   * scheduled when a practice of hers ends (`session_finished`), for the start of her window
//     three days later — one per day she practised;
//   * when it runs: she has not answered a question since (two whole days off); no test within two
//     weeks (then the countdown and the daily look prepare for it); Buddy offered no review in her
//     last three days, this one or the day after (at most once every three days); nothing is
//     planned for her today; and questions of hers are due for review (FSRS, by the app's clock).
//
// Both prepare a short practice and say one sentence as Buddy's own initiative (`origin: 'buddy'`),
// through the contact policy like every other message: without her consent nothing reaches the
// phone, it waits in the app (ADR 0006); quiet hours, pause, window and "Seltener schreiben" apply.
// Neither names a count or a missed day (rule 6). While she is in the app they wait.

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { addDays, daysBetween, localParts, zonedToInstant } from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import type { LearnerRow } from '../identity/model.js';
import { questionCountFor, selectPracticeItems } from '../practice/selection.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';
import { contactHistory, planOutreach } from './delivery.js';
import { deferredWhileInApp } from './inApp.js';
import { bumpContext, testAhead } from './plan.js';
import { MIN_RELEVANCE } from './policy.js';
import type { SettingsRow } from './state.js';

const REVIEW_NEXT_DAY = 'review_next_day';
const REVIEW_DUE = 'review_due';

/** Every review offer's topic starts so: the three-day spacing counts both moments. */
const REVIEW_TOPIC = 'review:';
/** A break: the wake-up's day is this many days after the last answer (two whole days off). */
const BREAK_DAYS = 3;
/** At most one review offer within this many of her days. */
const REVIEW_EVERY_DAYS = 3;
/** Worth saying (≥ 0.6) but not "important" (< 0.85): no phone after "Seltener schreiben". */
const NEXT_DAY_RELEVANCE = 0.7;
/** A short look back, not a lesson. */
const REVIEW_MINUTES = 5;
/** It is about this day; the next one has its own reasons. */
const REVIEW_EXPIRES_MS = 12 * 3_600_000;

/**
 * One review moment's wake-up, for the start of her window `days` after `at`. Both in her zone,
 * and the key is built from the day `at` falls on there.
 */
async function scheduleReview(
  db: Db,
  learnerId: string,
  at: Date,
  days: number,
  dedupeKey: (day: string) => string,
  payload: Record<string, unknown>,
): Promise<void> {
  const s = await db.maybeOne<Pick<SettingsRow, 'timezone' | 'preferred_start'>>(
    `select timezone, preferred_start from buddy_settings where learner_id = $1`,
    [learnerId],
  );
  if (!s) return;
  const day = localParts(at, s.timezone).date;
  await enqueueJob(db, {
    learnerId,
    kind: 'buddy_check',
    runAt: zonedToInstant(addDays(day, days), s.preferred_start, s.timezone),
    dedupeKey: dedupeKey(day),
    payload,
  });
}

/** The next day's wake-up for a sheet that was just read — once per sheet. */
export async function scheduleNextDayReview(
  db: Db,
  learnerId: string,
  materialId: string,
  at: Date,
): Promise<void> {
  await scheduleReview(db, learnerId, at, 1, () => `${REVIEW_TOPIC}${materialId}`, {
    reason: REVIEW_NEXT_DAY,
    material_id: materialId,
  });
}

/** The wake-up after a break, for a practice that just ended — one per day she practised. */
export async function scheduleBreakReview(db: Db, learnerId: string, at: Date): Promise<void> {
  await scheduleReview(db, learnerId, at, BREAK_DAYS, (day) => `review_due:${learnerId}:${day}`, {
    reason: REVIEW_DUE,
  });
}

/** Why a wake-up said nothing, or that it offered. */
type Outcome =
  // the day after a sheet
  | 'obsolete'
  | 'in_progress'
  | 'practised_today'
  | 'nothing_to_review'
  // after a break
  | 'no_break'
  | 'test_ahead'
  | 'too_soon'
  | 'planned_today'
  | 'nothing_due'
  // both
  | 'suppressed'
  | 'offered';

/** What one wake-up decided, kept in the job's result. */
type Decided = { outcome: Outcome; outreach?: string; reason?: string | null };

/** One wake-up, inside the transaction that holds her settings row (the one lock order). */
type Wake = {
  tx: Db;
  learner: LearnerRow;
  settings: SettingsRow;
  job: JobRow;
  now: Date;
  /** Her day, in her zone. */
  today: string;
};

/** A prepared practice and the sentence that offers it. */
type Offer = {
  title: string;
  items: string[];
  /** What the practice is from, kept with it in the step. */
  scope: { subject_id: string | null; material_id?: string };
  /** Also the outreach's dedupe key: the same offer is never said twice. */
  topicKey: string;
  body: string;
  relevance: number;
  /** The decision row's reason and what it was about. */
  why: string;
  trigger: Record<string, unknown>;
};

/** Prepares it, says it through the contact policy, records the decision and bumps the context. */
async function offerReview(w: Wake, o: Offer): Promise<Decided> {
  const step = await w.tx.one<{ id: string }>(
    `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
     values ($1, 'practice', $2, 'prepared', $3, $4, $5) returning id`,
    [
      w.learner.id,
      o.title,
      w.today,
      { item_ids: o.items, est_minutes: REVIEW_MINUTES, focus_topics: [], ...o.scope },
      w.now,
    ],
  );
  const plan = await planOutreach(w.tx, {
    learnerId: w.learner.id,
    settings: w.settings,
    now: w.now,
    decisionId: null,
    origin: 'buddy',
    kind: 'idea',
    topicKey: o.topicKey,
    dedupeKey: o.topicKey,
    title: t(w.learner.locale, 'title.buddy'),
    body: o.body,
    why: null,
    relevance: o.relevance,
    earliest: w.now,
    expiresAt: new Date(w.now.getTime() + REVIEW_EXPIRES_MS),
    goalId: null,
    stepId: step.id,
    template: null,
  });
  // Dropped (the same topic within 72 h): no card without its words.
  if (plan.status === 'suppressed') {
    await w.tx.query(`delete from buddy_steps where id = $1`, [step.id]);
    return { outcome: 'suppressed', outreach: plan.status, reason: plan.reason };
  }
  await w.tx.query(
    `insert into buddy_decisions (learner_id, mode, triggers, context_version, disposition, reason,
                                  prompt_version, created_at)
     values ($1, 'check', $2, $3, 'applied', $4, 'review.1', $5)`,
    [
      w.learner.id,
      JSON.stringify([{ reason: w.job.payload.reason, ...o.trigger }]),
      w.settings.context_version,
      o.why,
      w.now,
    ],
  );
  await bumpContext(w.tx, w.learner.id);
  return { outcome: 'offered', outreach: plan.status, reason: plan.reason };
}

/** The day after a sheet: that sheet, unless it is gone or she went over it already. */
async function decideNextDay(w: Wake): Promise<Decided> {
  const { tx, learner } = w;
  const materialId =
    typeof w.job.payload.material_id === 'string' ? w.job.payload.material_id : null;
  // Hers, read, not deleted — another learner's sheet is simply not found.
  const m = materialId
    ? await tx.maybeOne<{ id: string; title: string | null; subject_id: string | null }>(
        `select id, title, subject_id from materials
          where id = $1 and learner_id = $2 and status = 'ready' and archived_at is null`,
        [materialId, learner.id],
      )
    : null;
  if (!m) return { outcome: 'obsolete' };
  // A wake-up that runs twice (a retried job) never says it, or prepares it, twice.
  const said = await tx.maybeOne(
    `select 1 from buddy_outreach where learner_id = $1 and dedupe_key = $2`,
    [learner.id, `${REVIEW_TOPIC}${m.id}`],
  );
  if (said) return { outcome: 'obsolete' };
  // It is about the day after; a wake-up that ran late (the scheduler was down, she was in
  // the app all day) does not turn up days later next to whatever is due then.
  if (localParts(w.job.run_at, w.settings.timezone).date !== w.today)
    return { outcome: 'obsolete' };
  const dayStart = zonedToInstant(w.today, '00:00', w.settings.timezone);
  // Gone over today, or a practice with its questions is still open (that IS the review):
  // nothing to say.
  const busy = await tx.maybeOne<{ open: boolean }>(
    `select ps.status = 'active' as open
       from session_items si join items i on i.id = si.item_id
       join practice_sessions ps on ps.id = si.session_id
      where i.material_id = $1 and i.learner_id = $2
        and (ps.status = 'active' or (si.status <> 'open' and si.closed_at >= $3))
      order by ps.status = 'active' desc
      limit 1`,
    [m.id, learner.id, dayStart],
  );
  if (busy) return { outcome: busy.open ? 'in_progress' : 'practised_today' };
  const items = await selectPracticeItems(
    tx,
    learner.id,
    { materialId: m.id },
    [],
    questionCountFor(REVIEW_MINUTES),
    w.now,
  );
  if (items.length === 0) return { outcome: 'nothing_to_review' };
  return offerReview(w, {
    title: m.title ?? t(learner.locale, 'practice.untitled'),
    items,
    scope: { subject_id: m.subject_id, material_id: m.id },
    topicKey: `${REVIEW_TOPIC}${m.id}`,
    body: m.title
      ? t(learner.locale, 'material.review', { title: m.title })
      : t(learner.locale, 'material.review_untitled'),
    relevance: NEXT_DAY_RELEVANCE,
    why: 'review the day after (code)',
    trigger: { material_id: m.id },
  });
}

/** After a break: what has fallen due, unless something else already speaks to her. */
async function decideAfterBreak(w: Wake): Promise<Decided> {
  const { tx, learner, today } = w;
  const dayOf = (at: Date) => localParts(at, w.settings.timezone).date;
  // A break is days without a single answer — any practice, any question of hers.
  const last = await tx.one<{ at: Date | null }>(
    `select max(si.closed_at) as at
       from session_items si join practice_sessions ps on ps.id = si.session_id
      where ps.learner_id = $1 and si.status <> 'open'`,
    [learner.id],
  );
  if (!last.at || daysBetween(dayOf(last.at), today) < BREAK_DAYS) return { outcome: 'no_break' };
  if (await testAhead(tx, learner.id, today)) return { outcome: 'test_ahead' };
  // At most once every three days, counting the review the day after a sheet too. A rerun of
  // this wake-up finds its own offer here.
  const said = await contactHistory(tx, learner.id, w.now);
  if (
    said.some(
      (h) =>
        h.topicKey.startsWith(REVIEW_TOPIC) && daysBetween(dayOf(h.at), today) < REVIEW_EVERY_DAYS,
    )
  )
    return { outcome: 'too_soon' };
  // An agreed reminder, a practice for her test or a sheet's review today: that is today's.
  const planned = await tx.maybeOne(
    `select 1 from buddy_steps
      where learner_id = $1 and state in ('planned', 'prepared') and planned_date = $2::date
      limit 1`,
    [learner.id, today],
  );
  if (planned) return { outcome: 'planned_today' };
  const items = await selectPracticeItems(
    tx,
    learner.id,
    {},
    [],
    questionCountFor(REVIEW_MINUTES),
    w.now,
    { dueOnly: true },
  );
  if (items.length === 0) return { outcome: 'nothing_due' };
  return offerReview(w, {
    title: t(learner.locale, 'review.title'),
    items,
    scope: { subject_id: null },
    topicKey: `${REVIEW_TOPIC}due:${today}`,
    body: t(learner.locale, 'review.due'),
    // The least that is worth saying: in the app, or on the phone she allowed, never past
    // "Seltener schreiben".
    relevance: MIN_RELEVANCE,
    why: 'review after a break (code)',
    trigger: {},
  });
}

/** The moments by their wake-up's reason, in the order they run when both are due. */
const MOMENTS: Record<string, (w: Wake) => Promise<Decided>> = {
  // A sheet from yesterday first: the more specific offer, and the break counts it.
  [REVIEW_NEXT_DAY]: decideNextDay,
  [REVIEW_DUE]: decideAfterBreak,
};

/** The wake-ups `runReviews` handles (check.ts hands them over without asking the model). */
export const REVIEW_REASONS: ReadonlySet<string> = new Set(Object.keys(MOMENTS));

/** The due wake-ups of one learner (check.ts). Unasked, like a routine look: while she is in the app they wait. */
export async function runReviews(
  deps: Deps,
  learner: LearnerRow,
  jobs: readonly JobRow[],
): Promise<void> {
  if (jobs.length === 0 || (await deferredWhileInApp(deps, learner.id, jobs))) return;
  const order = Object.keys(MOMENTS);
  const rank = (j: JobRow) => order.indexOf(String(j.payload.reason));
  for (const job of [...jobs].sort((a, b) => rank(a) - rank(b))) {
    const moment = MOMENTS[String(job.payload.reason)]!;
    const now = deps.now();
    const result = await deps.db.tx(async (tx) => {
      const settings = await tx.one<SettingsRow>(
        `select * from buddy_settings where learner_id = $1 for update`,
        [learner.id],
      );
      const today = localParts(now, settings.timezone).date;
      return moment({ tx, learner, settings, job, now, today });
    });
    await finishJob(deps.db, job, deps.now(), { status: 'done', result });
  }
}
