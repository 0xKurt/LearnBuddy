// The learning domain's parts of the one screen (issue #107, cut 5; docs/architecture.md §Home):
// the card on top (a practice to resume or start, its result, a sheet being read or one that could
// not be read, a photo still needed), the one notice about a sheet, what is working for her,
// whether she practised today, what she is working on, a running roleplay — and what its cards in
// the conversation say now. The core (buddy/home.ts) builds the rest in the same snapshot; nothing
// here claims more than the data shows.

import {
  FINAL_FAILURES,
  type ActionSummary,
  type BuddyHome,
  type NowCard,
  type PreparedPractice,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import type { Db } from '../../lib/db.js';
import { daysBetween, startOfLocalDay } from '../../lib/time.js';
import { goalBrief } from '../buddy/home.js';
import type { CoreHomeKey, ThreadPage } from '../buddy/provider.js';
import { rehearsalsOf } from '../buddy/rehearse.js';
import { activeRoleplay, roleplayFeedbacks, roleplayStatuses } from '../buddy/roleplay.js';
import type { BuddyState, StepRow } from '../buddy/state.js';
import { resumable } from '../practice/lifecycle.js';

const UPLOAD_WINDOW_MS = 10 * 60_000;
/** How long a reading that just failed stays on top of everything else. */
const JUST_FAILED_MS = 30 * 60_000;

/** The domain's parts of the home screen, read in its snapshot (the provider's `home.screen`). */
export async function learningHome(
  deps: Deps,
  learnerId: string,
  state: BuddyState,
  today: string,
  now: Date,
): Promise<Omit<BuddyHome, CoreHomeKey>> {
  const tz = state.settings.timezone;
  // One after the other: they share the snapshot's connection.
  const nowCard = await nowCardOf(deps, learnerId, state, today, now);
  const working = await workingOf(deps, learnerId, now);
  const practicedToday = await practicedSince(deps, learnerId, startOfLocalDay(now, tz));
  const play = await activeRoleplay(deps.db, learnerId, now);
  return {
    now: nowCard,
    notice: noticeOf(state),
    working,
    practiced_today: practicedToday,
    focus: focusLine(state),
    roleplay: play ? { id: play.id, language: play.language, scene: play.scene } : null,
  };
}

/**
 * Whether she worked on a practice question since `since`: answered, tried or looked at the
 * solution. A question skipped untouched (e.g. when a session is finished early) or taken out
 * as not fitting does not count.
 */
async function practicedSince(deps: Deps, learnerId: string, since: Date): Promise<boolean> {
  const row = await deps.db.maybeOne(
    `select 1 from session_items si join practice_sessions ps on ps.id = si.session_id
      where ps.learner_id = $1 and si.flagged_at is null and si.closed_at >= $2
        and (si.status in ('correct', 'revealed', 'missed') or si.attempts > 0)
      limit 1`,
    [learnerId, since],
  );
  return row !== null;
}

/** A check the learner's own action started (their photos, their finished practice) that is due or running. */
async function workingOf(deps: Deps, learnerId: string, now: Date): Promise<BuddyHome['working']> {
  // Her photos being read: also when another card is on top (a homework photo behind a
  // prepared practice) — the app follows the home closely while anything is working.
  // Only while a reading job is really alive (a material left behind is set to failed by
  // the scheduler), not archived, and like the card for at most two hours.
  const reading = await deps.db.maybeOne(
    `select 1 from materials m
      where m.learner_id = $1 and m.status in ('queued', 'processing') and m.archived_at is null
        and m.created_at > $2::timestamptz - interval '2 hours'
        and exists (select 1 from jobs j where j.kind = 'extract_material'
                      and j.payload ->> 'material_id' = m.id::text
                      and j.status in ('queued', 'running'))
      limit 1`,
    [learnerId, now],
  );
  if (reading) return 'material';
  const row = await deps.db.maybeOne<{ reason: string }>(
    `select payload->>'reason' as reason from jobs
      where learner_id = $1 and kind = 'buddy_check' and status in ('queued', 'running')
        and payload->>'reason' in ('material_ready', 'session_finished')
        and run_at <= $2::timestamptz
      order by run_at, seq limit 1`,
    [learnerId, new Date(now.getTime() + 60_000)],
  );
  if (!row) return null;
  return row.reason === 'material_ready' ? 'material' : 'session';
}

/**
 * The one thing Buddy tells at the end of the conversation about a sheet he could not read
 * completely, while it is still at hand (a day after the reading, the window applied in
 * learning/state.ts so Buddy's context says the same thing).
 *
 * The SMALL question comes first (issue #164 point 1): a spot he could not settle, asked with
 * the readings to tap, so one smudged digit costs one tap and not a new photo of the whole page.
 * Only then the coarse step — the pages that could not be read at all. One at a time, never a
 * queue of asks: the next one stands here once this is answered or has let itself go.
 */
function noticeOf(state: BuddyState): BuddyHome['notice'] {
  for (const want of ['open', 'answered'] as const) {
    for (const m of state.materials) {
      if (m.status !== 'ready') continue;
      const spot = m.unclear.find((u) => u.status === want);
      if (!spot) continue;
      return {
        type: 'unclear_spot',
        // Her answer belongs to the sheet; the photos may have come as pages added to it, and
        // the app finds that page in its own copy on the phone.
        material_id: m.id,
        title: m.title,
        page: spot.page,
        photo_count: spot.photo_count,
        photo_material_id: spot.material_id,
        spot: {
          ref: spot.ref,
          task: spot.task,
          about: spot.about,
          // The alias of each reading is issued here, from its position: her tap answers with
          // it and the server resolves it back (CLAUDE.md rule 2).
          readings: spot.readings.map((text, i) => ({ ref: `r${i + 1}`, text })),
          status: want,
          answer: spot.answer,
        },
      };
    }
  }
  const missing = state.materials.find((m) => m.status === 'ready' && m.page_problems.length > 0);
  if (!missing) return null;
  return {
    type: 'pages_missing',
    material_id: missing.id,
    title: missing.title,
    photo_count: missing.photo_count,
    pages: missing.page_problems,
  };
}

/**
 * Prepared practice for today ("Heute nicht" moved it away).
 *
 * The one she ASKED FOR comes first, newest first; everything Buddy prepared by himself keeps
 * the earliest test first. Sorting only by the test's date put the French vocabulary she had
 * just asked for behind maths practice a check had prepared for tomorrow's test — so the card
 * on top pointed at the older thing and the one she wanted was not reachable from there at all
 * (issue #196, point 3; it has no test, so its date sorted last). The bar on top is "the thing
 * to act on now" (lib/homeLayout.ts), and what she just asked for is the best evidence of now.
 */
function preparedOf(
  state: BuddyState,
  today: string,
  /** Steps she asked for in the chat, newest first (`askedForSteps`). */
  asked: readonly string[] = [],
): StepRow | undefined {
  const rank = (s: StepRow): number => {
    const at = asked.indexOf(s.id);
    return at < 0 ? asked.length : at;
  };
  return state.steps
    .filter(
      (s) =>
        s.kind === 'practice' &&
        s.state === 'prepared' &&
        (s.payload.item_ids?.length ?? 0) > 0 &&
        // "Heute nicht" moved it to tomorrow: not on today's card.
        (!s.planned_date || daysBetween(today, s.planned_date) <= 0),
    )
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      const ga = state.goals.find((g) => g.id === a.goal_id)?.due_date ?? '9999-12-31';
      const gb = state.goals.find((g) => g.id === b.goal_id)?.due_date ?? '9999-12-31';
      return ga < gb ? -1 : ga > gb ? 1 : 0;
    })[0];
}

/**
 * Which prepared practice the learner asked for herself, newest first — read off the action
 * that made it, in a turn (her message) rather than in a background check. The same join
 * `prepare_practice` already uses to leave her own practice alone (tools.ts, audit M-55);
 * nothing new is stored for it.
 */
async function askedForSteps(deps: Deps, learnerId: string): Promise<string[]> {
  const rows = await deps.db.query<{ step_id: string }>(
    `select a.result ->> 'step_id' as step_id
       from buddy_actions a join buddy_decisions d on d.id = a.decision_id
      where a.learner_id = $1 and a.tool = 'prepare_practice' and a.status = 'applied'
        and d.mode = 'turn'
      order by a.seq desc
      limit 20`,
    [learnerId],
  );
  return rows.map((r) => r.step_id).filter((id): id is string => id !== null);
}

function preparedBrief(state: BuddyState, step: StepRow, today: string): PreparedPractice {
  const goal = step.goal_id ? state.goals.find((g) => g.id === step.goal_id) : undefined;
  return {
    step_id: step.id,
    title: step.title,
    question_count: step.payload.item_ids?.length ?? 0,
    est_minutes: step.payload.est_minutes ?? 10,
    focus_topics: step.payload.focus_topics ?? [],
    goal: goal ? goalBrief(goal, today) : null,
  };
}

/**
 * A sheet whose reading failed: why, and what she can do ("Nochmal lesen", "Neues Foto").
 * What "Neues Foto" re-opens: the same purpose, and for a failed retake or added page the
 * sheet it belongs to (audit M-18); the title names the sheet.
 */
async function failedCard(
  deps: Deps,
  learnerId: string,
  failed: Pick<BuddyState['materials'][number], 'id' | 'failure_reason'>,
): Promise<NowCard> {
  const row = await deps.db.maybeOne<{
    n: number;
    purpose: 'study' | 'homework';
    completes: string | null;
    title: string | null;
    photos_deleted: boolean;
  }>(
    `select (select count(*)::int from jobs where learner_id = $1 and kind = 'extract_material'
               and payload ->> 'material_id' = $2::text) as n,
            m.purpose, m.completes_material_id as completes,
            coalesce(root.title, m.title) as title,
            m.photos_deleted_at is not null as photos_deleted
       from materials m
       left join materials root on root.id = m.completes_material_id and root.learner_id = $1
      where m.id = $2::uuid and m.learner_id = $1`,
    [learnerId, failed.id],
  );
  return {
    type: 'material_failed',
    material_id: failed.id,
    reason: failed.failure_reason,
    // "Nochmal lesen" is only offered where a second reading can actually work: not for a
    // verdict that would repeat, not when the photos never arrived or are already gone
    // (retryMaterial refuses all three — the card must not promise what the API declines).
    // A verdict a second reading would repeat (FINAL_FAILURES: #198, #259) offers none.
    retryable:
      !(failed.failure_reason && FINAL_FAILURES.has(failed.failure_reason)) &&
      failed.failure_reason !== 'photos_missing' &&
      !(row?.photos_deleted ?? false) &&
      (row?.n ?? 0) < 3,
    purpose: row?.purpose ?? 'study',
    completes: row?.completes ?? null,
    title: row?.title ?? null,
  };
}

async function nowCardOf(
  deps: Deps,
  learnerId: string,
  state: BuddyState,
  today: string,
  now: Date,
): Promise<NowCard | null> {
  // Open sessions to go on with, keyed on her last activity (audit H-7, decision D-5): one
  // she used in the last 12 hours comes first; an older paused one (homework up to 14 days)
  // comes after Buddy's prepared practice, so it never hides that.
  // Her photos could not be read just now: she is told at once, above a result or prepared
  // practice — the "reading" line must never just vanish (live finding 2, rule 5).
  const justFailed = await deps.db.maybeOne<{ id: string }>(
    `select m.id from materials m
      where m.learner_id = $1 and m.status = 'failed' and m.archived_at is null
        and exists (select 1 from jobs j where j.kind = 'extract_material'
                      and j.payload ->> 'material_id' = m.id::text
                      and j.finished_at > $2::timestamptz)
      order by m.created_at desc limit 1`,
    [learnerId, new Date(now.getTime() - JUST_FAILED_MS)],
  );
  const justFailedMaterial = justFailed
    ? state.materials.find((m) => m.id === justFailed.id)
    : undefined;
  if (justFailedMaterial) return failedCard(deps, learnerId, justFailedMaterial);
  const open = state.sessions.filter((s) => resumable(s, now));
  const resumeCard = (active: (typeof open)[number]): NowCard => {
    const goal = active.goal_id ? state.goals.find((g) => g.id === active.goal_id) : undefined;
    const step = active.step_id ? state.steps.find((s) => s.id === active.step_id) : undefined;
    return {
      type: 'resume_practice',
      session_id: active.id,
      mode: active.mode,
      title: active.title ?? goal?.title ?? step?.title ?? '',
      remaining: active.total - active.answered,
    };
  };
  const recent = open.find((s) => now.getTime() - s.last_activity_at.getTime() < 12 * 3_600_000);
  if (recent) return resumeCard(recent);
  const justFinished = state.sessions.find(
    (s) =>
      s.status === 'finished' &&
      // Left without answering anything: nothing to celebrate or report.
      s.answered > 0 &&
      s.finished_at &&
      now.getTime() - s.finished_at.getTime() < 30 * 60_000,
  );
  // Today's prepared practice (the earliest test first). What was just finished is not it
  // (its step is no longer 'prepared').
  const prepared = preparedOf(state, today, await askedForSteps(deps, learnerId));
  if (justFinished) {
    return {
      type: 'practice_result',
      session_id: justFinished.id,
      mode: justFinished.mode,
      result: {
        answered: justFinished.answered,
        first_try: justFinished.first_try,
        secure_topics: justFinished.secure_topics,
        shaky_topics: justFinished.shaky_topics,
      },
      // The result never hides what is ready next (user feedback #2): the one card says both.
      next: prepared ? preparedBrief(state, prepared, today) : null,
    };
  }
  if (prepared) return { type: 'practice_ready', ...preparedBrief(state, prepared, today) };
  if (open[0]) return resumeCard(open[0]);
  // The sheet being read now comes before an older failure (audit M-19).
  // Photos still on their way count only briefly: an upload the app gave up on is not
  // "being sent" for hours (and Buddy then still asks for the photo).
  const processing = state.materials.find((m) => {
    const age = now.getTime() - m.created_at.getTime();
    // Pages she is still attaching never get here: learning/state.ts leaves a reservation
    // nobody asked to send out of `materials` (issue #56).
    if (m.status === 'awaiting_upload') return age < UPLOAD_WINDOW_MS;
    return (m.status === 'queued' || m.status === 'processing') && age < 2 * 3_600_000;
  });
  if (processing) {
    // Where the reading really is (migration 0035): the stage the reading run reported.
    const row = await deps.db.one<{
      read_stage: 'opening' | 'reading' | null;
      purpose: 'study' | 'homework';
    }>(`select read_stage, purpose from materials where id = $1`, [processing.id]);
    return {
      type: 'material_processing',
      material_id: processing.id,
      status: processing.status as 'awaiting_upload' | 'queued' | 'processing',
      stage:
        processing.status === 'awaiting_upload'
          ? 'sending'
          : processing.status === 'processing' && row.read_stage === 'reading'
            ? 'reading'
            : 'waiting',
      pages: Math.max(1, processing.photo_count),
      found: null,
      purpose: row.purpose,
    };
  }
  // Read, and the Buddy check it woke is making practice from it right now: the same card
  // goes on with what was found (a result), until the check is done.
  const building = await deps.db.maybeOne<{
    id: string;
    photo_count: number;
    found: number | null;
  }>(
    `select m.id, m.photo_count, (e.data ->> 'questions')::int as found
       from buddy_events e
       join materials m on m.id = e.ref_id and m.learner_id = $1
      where e.learner_id = $1 and e.type = 'material_ready' and m.archived_at is null
        and m.created_at > $2::timestamptz - interval '2 hours'
        and exists (select 1 from jobs j
                     where j.learner_id = $1 and j.kind = 'buddy_check'
                       and j.status in ('queued', 'running')
                       and j.payload ->> 'event_id' = e.id::text
                       and j.run_at <= $2::timestamptz + interval '1 minute')
      order by e.created_at desc
      limit 1`,
    [learnerId, now],
  );
  if (building) {
    return {
      type: 'material_processing',
      material_id: building.id,
      status: 'ready',
      stage: 'building',
      pages: Math.max(1, building.photo_count),
      found: building.found,
      purpose: 'study',
    };
  }
  // A failure from the last day, counted from when it failed — not from when the photos were
  // reserved: a send given up after a day fails a day after that (issue #115), and its card
  // would never have come up at all.
  const failed = state.materials.find(
    (m) =>
      m.status === 'failed' &&
      now.getTime() - (m.failed_at ?? m.created_at).getTime() < 24 * 3_600_000,
  );
  if (failed) return failedCard(deps, learnerId, failed);
  const capture = state.steps.find((s) => s.kind === 'capture' && s.state === 'planned');
  if (capture) {
    const goal = capture.goal_id ? state.goals.find((g) => g.id === capture.goal_id) : undefined;
    return {
      type: 'capture_needed',
      step_id: capture.id,
      title: capture.title,
      goal: goal ? goalBrief(goal, today) : null,
      completes: capture.payload.completes ?? null,
    };
  }
  return null;
}

/**
 * What she is working on, as one line (issue #160).
 *
 * Her own words first, because the line should read like her: "frag mich die vokabeln von
 * dem zettel ab" says more to her than "Französisch · Vokabelliste" does. The sheet and the
 * subject are the fallback, and nothing at all is the honest answer while nothing has been
 * agreed — an empty slot waiting to be filled is a dashboard, which this is not (rule 16).
 */
function focusLine(state: BuddyState): { text: string; material_id: string | null } | null {
  const f = state.focus;
  if (!f) return null;
  const said = f.said?.trim();
  if (said) return { text: said, material_id: f.material_id };
  const parts = [f.subject_name, f.material_title].filter((x): x is string => Boolean(x));
  if (parts.length === 0) return null;
  return { text: parts.join(' · '), material_id: f.material_id };
}

/**
 * When she last acted on her own — sent a photo, started a practice: quick answers belong to
 * their moment, and once she acted since, "Foto machen / Später fotografieren" are gone (live
 * finding 8).
 */
export async function lastActed(db: Db, learnerId: string): Promise<Date | null> {
  const acted = await db.one<{ at: Date | null }>(
    `select greatest(
       (select max(created_at) from materials where learner_id = $1),
       (select max(started_at) from practice_sessions where learner_id = $1)) as at`,
    [learnerId],
  );
  return acted.at;
}

/** What the domain's cards on one page of the conversation say now. */
export async function dressThread(db: Db, learnerId: string, page: ThreadPage, now: Date) {
  const cannotStart = new Set(
    page.actions.filter((a) => a.cannot_start_at !== null).map((a) => a.id),
  );
  const roleplays = await roleplayStatuses(
    db,
    learnerId,
    page.actions.flatMap((a) => (a.result.tool === 'start_roleplay' ? [a.result.roleplay_id] : [])),
    now,
  );
  // The feedback after a roleplay, for the result card (issue #384).
  const feedbacks = await roleplayFeedbacks(
    db,
    learnerId,
    page.messages.flatMap((m) => (m.roleplay_id ? [m.roleplay_id] : [])),
  );
  // What a rehearsal measured, for the result card under Buddy's message (issue #264).
  const rehearsals = await rehearsalsOf(
    db,
    learnerId,
    page.messages.flatMap((m) => (m.rehearsal_id ? [m.rehearsal_id] : [])),
  );
  return {
    summary: (actionId: string, s: ActionSummary): ActionSummary => {
      // Where the roleplay stands now (issue #244): the card offers "end" only while it runs.
      if (s.tool === 'start_roleplay')
        return { ...s, status: roleplays.get(s.roleplay_id) ?? 'ended' };
      // Stored offers of the removed explain mode (issue #70) are shown — and started — as
      // practice on the same topic: the check questions always were practice, and the
      // explanation itself lives in the chat now.
      if (s.tool === 'offer_learning' && (s.kind as string) === 'explain')
        return { ...s, kind: 'practice' };
      // Not a button any more. The refusal is the generator's own, learnt while she was still
      // reading the reply (practice/prepare.ts): she sees the quiet line straight away instead
      // of tapping and waiting for it (issue #196).
      if (s.tool === 'offer_learning' && cannotStart.has(actionId))
        return { ...s, startable: false };
      return s;
    },
    message: (m: ThreadPage['messages'][number]) => ({
      roleplay_feedback: m.roleplay_id ? (feedbacks.get(m.roleplay_id) ?? null) : null,
      ...(m.rehearsal_id ? { rehearsal: rehearsals.get(m.rehearsal_id) ?? null } : {}),
    }),
  };
}
