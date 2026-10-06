// "Am Tag danach" (issue #446): the day after a sheet or a notebook entry was read, Buddy offers
// to go over it once more. Retrieval after a night's sleep is the strongest lever for keeping
// what was learned (spacing, the testing effect), and a notebook entry is exactly what the next
// lesson builds on. docs/architecture.md §Proactivity.
//
// Code decides, from data, never the model (CLAUDE.md rule 1):
//   * scheduled once per sheet when its reading is done (`material_ready`, events.ts), for the
//     start of her preferred window the next day, in her zone; homework never (no event);
//   * when it runs: the sheet is still hers, read and not deleted; she has not answered any of
//     its questions today (then it is not needed); a short practice from that sheet can be put
//     together — otherwise nothing is said;
//   * the message is Buddy's own initiative (`origin: 'buddy'`) and goes through the contact
//     policy like every other: without her consent nothing reaches the phone, it waits in the
//     app (ADR 0006); quiet hours, pause, window and "Seltener schreiben" apply. It names no
//     count and no missed day (rule 6).

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { addDays, localParts, zonedToInstant } from '../../lib/time.js';
import { t } from '../../i18n/index.js';
import type { LearnerRow } from '../identity/model.js';
import { questionCountFor, selectPracticeItems } from '../practice/selection.js';
import { enqueueJob, finishJob, type JobRow } from '../scheduler/jobs.js';
import { planOutreach } from './delivery.js';
import { deferredWhileInApp } from './inApp.js';
import { bumpContext } from './plan.js';
import type { SettingsRow } from './state.js';

/** The wake-up's `reason`. */
export const REVIEW_NEXT_DAY = 'review_next_day';

/** Buddy's own initiative, worth saying (≥ 0.6) but not "important" (< 0.85): no phone after "Seltener schreiben". */
const REVIEW_RELEVANCE = 0.7;
/** A short look back, not a lesson. */
const REVIEW_MINUTES = 5;
/** It is about this day; the next one has its own reasons. */
const REVIEW_EXPIRES_MS = 12 * 3_600_000;

/** The next day's wake-up for a sheet that was just read — once per sheet. */
export async function scheduleNextDayReview(
  db: Db,
  learnerId: string,
  materialId: string,
  at: Date,
): Promise<void> {
  const s = await db.maybeOne<Pick<SettingsRow, 'timezone' | 'preferred_start'>>(
    `select timezone, preferred_start from buddy_settings where learner_id = $1`,
    [learnerId],
  );
  if (!s) return;
  const next = addDays(localParts(at, s.timezone).date, 1);
  await enqueueJob(db, {
    learnerId,
    kind: 'buddy_check',
    runAt: zonedToInstant(next, s.preferred_start, s.timezone),
    dedupeKey: `review:${materialId}`,
    payload: { reason: REVIEW_NEXT_DAY, material_id: materialId },
  });
}

type Outcome = 'obsolete' | 'in_progress' | 'practised_today' | 'nothing_to_review' | 'offered';

/** The due wake-ups of one learner (check.ts). Unasked, like a routine look: while she is in the app they wait. */
export async function runReviews(
  deps: Deps,
  learner: LearnerRow,
  jobs: readonly JobRow[],
): Promise<void> {
  if (jobs.length === 0 || (await deferredWhileInApp(deps, learner.id, jobs))) return;
  for (const job of jobs) await offerNextDayReview(deps, learner, job);
}

/** Runs one wake-up: decides, prepares and says it — or says why not, in the job's result. */
async function offerNextDayReview(deps: Deps, learner: LearnerRow, job: JobRow): Promise<void> {
  const now = deps.now();
  const materialId = typeof job.payload.material_id === 'string' ? job.payload.material_id : null;
  const result = await deps.db.tx(async (tx) => {
    const settings = await tx.one<SettingsRow>(
      `select * from buddy_settings where learner_id = $1 for update`,
      [learner.id],
    );
    const decided = (outcome: Outcome, extra: Record<string, unknown> = {}) => ({
      outcome,
      ...extra,
    });
    // Hers, read, not deleted — another learner's sheet is simply not found.
    const m = materialId
      ? await tx.maybeOne<{ id: string; title: string | null; subject_id: string | null }>(
          `select id, title, subject_id from materials
            where id = $1 and learner_id = $2 and status = 'ready' and archived_at is null`,
          [materialId, learner.id],
        )
      : null;
    if (!m) return decided('obsolete');
    // A wake-up that runs twice (a retried job) never says it, or prepares it, twice.
    const said = await tx.maybeOne(
      `select 1 from buddy_outreach where learner_id = $1 and dedupe_key = $2`,
      [learner.id, `review:${m.id}`],
    );
    if (said) return decided('obsolete');
    // It is about the day after; a wake-up that ran late (the scheduler was down, she was in
    // the app all day) does not turn up days later next to whatever is due then.
    const today = localParts(now, settings.timezone).date;
    if (localParts(job.run_at, settings.timezone).date !== today) return decided('obsolete');
    const dayStart = zonedToInstant(today, '00:00', settings.timezone);
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
    if (busy) return decided(busy.open ? 'in_progress' : 'practised_today');
    const items = await selectPracticeItems(
      tx,
      learner.id,
      { materialId: m.id },
      [],
      questionCountFor(REVIEW_MINUTES),
      now,
    );
    if (items.length === 0) return decided('nothing_to_review');
    const title = m.title ?? t(learner.locale, 'practice.untitled');
    const step = await tx.one<{ id: string }>(
      `insert into buddy_steps (learner_id, kind, title, state, planned_date, payload, prepared_at)
       values ($1, 'practice', $2, 'prepared', $3, $4, $5) returning id`,
      [
        learner.id,
        title,
        localParts(now, settings.timezone).date,
        {
          item_ids: items,
          est_minutes: REVIEW_MINUTES,
          focus_topics: [],
          subject_id: m.subject_id,
          material_id: m.id,
        },
        now,
      ],
    );
    const plan = await planOutreach(tx, {
      learnerId: learner.id,
      settings,
      now,
      decisionId: null,
      origin: 'buddy',
      kind: 'idea',
      topicKey: `review:${m.id}`,
      dedupeKey: `review:${m.id}`,
      title: t(learner.locale, 'title.buddy'),
      body: m.title
        ? t(learner.locale, 'material.review', { title: m.title })
        : t(learner.locale, 'material.review_untitled'),
      why: null,
      relevance: REVIEW_RELEVANCE,
      earliest: now,
      expiresAt: new Date(now.getTime() + REVIEW_EXPIRES_MS),
      goalId: null,
      stepId: step.id,
      template: null,
    });
    // Dropped (the same topic within 72 h): no card without its words.
    if (plan.status === 'suppressed') {
      await tx.query(`delete from buddy_steps where id = $1`, [step.id]);
      return decided('nothing_to_review', { outreach: plan.status, reason: plan.reason });
    }
    await tx.query(
      `insert into buddy_decisions (learner_id, mode, triggers, context_version, disposition, reason,
                                    prompt_version, created_at)
       values ($1, 'check', $2, $3, 'applied', 'review the day after (code)', 'review.1', $4)`,
      [
        learner.id,
        JSON.stringify([{ reason: REVIEW_NEXT_DAY, material_id: m.id }]),
        settings.context_version,
        now,
      ],
    );
    await bumpContext(tx, learner.id);
    return decided('offered', { outreach: plan.status, reason: plan.reason });
  });
  await finishJob(deps.db, job, deps.now(), { status: 'done', result });
}
