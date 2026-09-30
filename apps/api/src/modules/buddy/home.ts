// The one screen: what is relevant now, the one open decision, what Buddy
// did (with real status), what comes next, and the conversation.
// docs/architecture.md §Home. Everything is derived from stored state —
// no card claims more than the data shows.

import type {
  ActionSummary,
  ActionView,
  BuddyHome,
  Decision,
  GoalBrief,
  MessageView,
  HomeNotice,
  NowCard,
  OutreachView,
  PreparedPractice,
  UpcomingItem,
} from '@learnbuddy/shared-types/contracts';

import { DAILY_LIMITS } from '../../config.js';
import type { Deps } from '../../deps.js';
import { daysBetween, localParts, startOfLocalDay } from '../../lib/time.js';
import type { BuddyState, GoalRow } from './state.js';
import { undoApplies, undoLoosensContact, type UndoSpec } from './tools.js';
import { loadBuddyState, loadSettings } from './state.js';
import { resumable } from '../practice/lifecycle.js';

const THREAD_LIMIT = 30;
const DONE_WINDOW_MS = 72 * 3_600_000;
const UNDO_WINDOW_MS = 7 * 86_400_000;
const HEARTBEAT_STALE_MS = 10 * 60_000;
const UPLOAD_WINDOW_MS = 10 * 60_000;

type LearnerLite = { id: string; display_name: string; isMinor: boolean };

function goalBrief(g: GoalRow, today: string): GoalBrief {
  return {
    id: g.id,
    kind: g.kind,
    title: g.title,
    due_date: g.due_date,
    days_left: g.due_date ? daysBetween(today, g.due_date) : null,
    subject_name: g.subject_name,
  };
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export async function buildHome(
  deps: Deps,
  learner: LearnerLite,
  beforeMessageId?: string,
): Promise<BuddyHome> {
  // Ensure the settings row exists outside the snapshot (a first-time insert inside a
  // repeatable-read transaction could fail on a concurrent one).
  await loadSettings(deps.db, learner.id);
  // One snapshot for the whole screen: the parts are read by separate queries, and a
  // job committing between them (a page joining the homework session) must not give a
  // card from before it next to "nothing is working" from after it — the app would
  // then stop polling closely and keep the stale card (web walkthrough flake).
  return deps.db.tx(async (db) => {
    await db.query('set transaction isolation level repeatable read');
    return homeFrom({ ...deps, db }, learner, beforeMessageId);
  });
}

async function homeFrom(
  deps: Deps,
  learner: LearnerLite,
  beforeMessageId: string | undefined,
): Promise<BuddyHome> {
  const now = deps.now();
  const state = await loadBuddyState(deps.db, learner.id, now);
  const tz = state.settings.timezone;
  const today = localParts(now, tz).date;

  // One after the other: they share the snapshot's connection.
  const nowCard = await nowCardOf(deps, learner.id, state, today, now);
  const decision = await decisionOf(state, learner, today, now);
  const done = await doneOf(deps, learner, now);
  const thread = await threadOf(deps, learner, beforeMessageId);
  const system = await systemOf(deps, learner.id, state);
  const working = await workingOf(deps, learner.id, now);
  const practicedToday = await practicedSince(deps, learner.id, startOfLocalDay(now, tz));

  return {
    learner: { id: learner.id, name: learner.display_name, is_minor: learner.isMinor },
    now: nowCard,
    notice: noticeOf(state),
    decision,
    done,
    next: nextOf(state, today, now),
    thread: thread.messages,
    thread_has_more: thread.hasMore,
    system,
    working,
    practiced_today: practicedToday,
    context_version: state.settings.context_version,
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
 * Pages Buddy could not read, while the sheet is still at hand (a day after the reading,
 * applied in loadBuddyState so Buddy's context says the same): Buddy says it at the end of
 * the conversation; the rest of the sheet is ready (docs/architecture.md §Material).
 */
function noticeOf(state: BuddyState): HomeNotice | null {
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

type StepRow = BuddyState['steps'][number];

/** Prepared practice for today ("Heute nicht" moved it away), the earliest test first. */
function preparedOf(state: BuddyState, today: string): StepRow | undefined {
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
      const ga = state.goals.find((g) => g.id === a.goal_id)?.due_date ?? '9999-12-31';
      const gb = state.goals.find((g) => g.id === b.goal_id)?.due_date ?? '9999-12-31';
      return ga < gb ? -1 : ga > gb ? 1 : 0;
    })[0];
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
    retryable:
      failed.failure_reason !== 'not_learning_material' &&
      failed.failure_reason !== 'blocked' &&
      failed.failure_reason !== 'photos_missing' &&
      !(row?.photos_deleted ?? false) &&
      (row?.n ?? 0) < 3,
    purpose: row?.purpose ?? 'study',
    completes: row?.completes ?? null,
    title: row?.title ?? null,
  };
}

/** How long a reading that just failed stays on top of everything else. */
const JUST_FAILED_MS = 30 * 60_000;

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
  const prepared = preparedOf(state, today);
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
    // Pages she is still attaching never get here: buddy/state.ts leaves a reservation
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

function decisionOf(
  state: BuddyState,
  learner: LearnerLite,
  today: string,
  now: Date,
): Decision | null {
  const past = state.goals.find(
    (g) =>
      g.kind === 'exam' &&
      g.status === 'active' &&
      g.due_date &&
      daysBetween(today, g.due_date) < 0,
  );
  if (past) return { type: 'how_did_it_go', goal: goalBrief(past, today) };
  const s = state.settings;
  const hidden = s.opt_in_prompt_hidden_until && s.opt_in_prompt_hidden_until > now;
  const somethingToFollow = state.totals.activeGoals > 0;
  if (!s.contact_enabled && !hidden && somethingToFollow) {
    return {
      type: 'contact_opt_in',
      can_enable_here: !learner.isMinor,
      rules: { quiet_start: s.quiet_start },
    };
  }
  return null;
}

/**
 * Under 16 she cannot undo her way to more contact to the phone: that needs the adult's PIN
 * (rule 6, ADR 0006), so the button is not offered to her; the server refuses it anyway.
 */
async function needsAdult(
  deps: Deps,
  learner: LearnerLite,
  undo: UndoSpec | null,
  now: Date,
): Promise<boolean> {
  return learner.isMinor && undo !== null && undoLoosensContact(deps.db, learner.id, undo, now);
}

/**
 * Stored offers of the removed explain mode (issue #70) are shown — and started — as
 * practice on the same topic: the check questions always were practice, and the
 * explanation itself lives in the chat now.
 */
function servedSummary(s: ActionSummary): ActionSummary {
  return s.tool === 'offer_learning' && (s.kind as string) === 'explain'
    ? { ...s, kind: 'practice' }
    : s;
}

async function doneOf(deps: Deps, learner: LearnerLite, now: Date): Promise<ActionView[]> {
  const learnerId = learner.id;
  const rows = await deps.db.query<{
    id: string;
    status: 'applied' | 'undone';
    result: ActionSummary;
    undo: UndoSpec | null;
    created_at: Date;
  }>(
    `select id, status, result, undo, created_at from buddy_actions
      where learner_id = $1 and created_at > $2 and tool not in ('offer_learning', 'open_area')
      order by seq desc limit 12`,
    [learnerId, new Date(now.getTime() - DONE_WINDOW_MS)],
  );
  const views: ActionView[] = [];
  // One after the other: the home is read on one connection (one snapshot).
  for (const r of rows) {
    views.push({
      id: r.id,
      status: r.status,
      // Offered only when it would work now (nothing changed since).
      undoable:
        r.status === 'applied' &&
        r.undo !== null &&
        now.getTime() - r.created_at.getTime() < UNDO_WINDOW_MS &&
        (await undoApplies(deps.db, learnerId, r.undo)) &&
        !(await needsAdult(deps, learner, r.undo, now)),
      summary: r.result,
      created_at: r.created_at.toISOString(),
    });
  }
  return views;
}

function nextOf(state: BuddyState, today: string, now: Date): UpcomingItem[] {
  const items: UpcomingItem[] = [];
  for (const g of state.goals) {
    if (g.status !== 'active' || !g.due_date || daysBetween(today, g.due_date) < 0) continue;
    items.push({
      kind: 'exam',
      id: g.id,
      title: g.title,
      date: g.due_date,
      time: null,
      state: g.status,
      agreed: false,
    });
  }
  for (const s of state.steps) {
    if (!s.planned_date || daysBetween(today, s.planned_date) < 0) continue;
    // Planned steps, and prepared practice she moved to a later day.
    if (
      s.state !== 'planned' &&
      !(s.state === 'prepared' && daysBetween(today, s.planned_date) > 0)
    )
      continue;
    if (s.kind === 'capture') continue; // shown as the "now" card
    items.push({
      kind: 'step',
      id: s.id,
      title: s.title,
      date: s.planned_date,
      time: s.planned_time,
      state: s.state,
      agreed: s.agreed,
    });
  }
  // Messages Buddy has planned (not yet sent), unless their step is listed already. Like at
  // sending time, one whose step is no longer open or whose goal is closed will not go out.
  const listedSteps = new Set(items.filter((i) => i.kind === 'step').map((i) => i.id));
  const openStep = (id: string) =>
    state.steps.some((s) => s.id === id && (s.state === 'planned' || s.state === 'prepared'));
  const activeGoal = (id: string) => state.goals.some((g) => g.id === id && g.status === 'active');
  for (const o of state.outreach) {
    if (o.status !== 'scheduled' || !o.send_at || o.send_at <= now) continue;
    if (o.step_id && (listedSteps.has(o.step_id) || !openStep(o.step_id))) continue;
    if (o.goal_id && !activeGoal(o.goal_id)) continue;
    const at = localParts(o.send_at, state.settings.timezone);
    items.push({
      kind: 'message',
      id: o.id,
      title: o.title,
      date: at.date,
      time: at.time,
      state: o.status,
      agreed: o.origin === 'agreed',
    });
  }
  return items
    .sort((a, b) =>
      `${a.date ?? ''}${a.time ?? ''}`.localeCompare(`${b.date ?? ''}${b.time ?? ''}`),
    )
    .slice(0, 5);
}

async function threadOf(
  deps: Deps,
  learner: LearnerLite,
  beforeMessageId?: string,
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  const learnerId = learner.id;
  const rows = await deps.db.query<{
    id: string;
    role: 'learner' | 'buddy';
    text: string;
    status: 'processing' | 'done' | 'failed';
    failure_code: string | null;
    client_message_id: string | null;
    ask: { options?: string[] } | null;
    reply_to_id: string | null;
    outreach_id: string | null;
    decision_id: string | null;
    created_at: Date;
  }>(
    `select id, role, text, status, failure_code, client_message_id, ask, reply_to_id, outreach_id,
            decision_id, created_at
       from buddy_messages
      where learner_id = $1
        and ($2::uuid is null or seq < (select seq from buddy_messages where id = $2 and learner_id = $1))
      order by seq desc
      limit $3`,
    [learnerId, beforeMessageId ?? null, THREAD_LIMIT + 1],
  );
  const hasMore = rows.length > THREAD_LIMIT;
  const page = rows.slice(0, THREAD_LIMIT).reverse();

  const decisionIds = page.map((m) => m.decision_id).filter((d): d is string => !!d);
  const outreachIds = page.map((m) => m.outreach_id).filter((d): d is string => !!d);
  const now = deps.now();
  const actions = decisionIds.length
    ? await deps.db.query<{
        id: string;
        decision_id: string;
        status: 'applied' | 'undone';
        result: ActionSummary;
        undo: UndoSpec | null;
        created_at: Date;
      }>(
        `select id, decision_id, status, result, undo, created_at from buddy_actions
          where learner_id = $1 and decision_id = any($2::uuid[]) order by seq`,
        [learnerId, decisionIds],
      )
    : [];
  const outreach = outreachIds.length
    ? await deps.db.query<{
        id: string;
        kind: OutreachView['kind'];
        origin: OutreachView['origin'] | 'learner';
        title: string;
        body: string;
        why: string | null;
        status: OutreachView['status'];
        send_at: Date | null;
        sent_at: Date | null;
        opened_at: Date | null;
        created_at: Date;
      }>(
        `select id, kind, origin, title, body, why, status, send_at, sent_at, opened_at, created_at
           from buddy_outreach where learner_id = $1 and id = any($2::uuid[])`,
        [learnerId, outreachIds],
      )
    : [];

  // Undo that would need the adult is not offered to a minor (see needsAdult), and undo is
  // offered only when it would work — the same check as the undo itself (audit M-56).
  const adultOnly = new Set<string>();
  const undoWorks = new Set<string>();
  for (const a of actions) {
    if (a.status !== 'applied' || a.undo === null) continue;
    if (now.getTime() - a.created_at.getTime() >= UNDO_WINDOW_MS) continue;
    if (await needsAdult(deps, learner, a.undo, now)) adultOnly.add(a.id);
    if (await undoApplies(deps.db, learnerId, a.undo)) undoWorks.add(a.id);
  }
  // Quick answers belong to their moment: once she acted since (sent a photo, started a
  // practice), "Foto machen / Später fotografieren" are gone (live finding 8).
  const acted = await deps.db.one<{ at: Date | null }>(
    `select greatest(
       (select max(created_at) from materials where learner_id = $1),
       (select max(started_at) from practice_sessions where learner_id = $1)) as at`,
    [learnerId],
  );
  const stale = (at: Date) => acted.at !== null && acted.at.getTime() > at.getTime();
  const messages: MessageView[] = page.map((m) => {
    const o = m.outreach_id ? outreach.find((x) => x.id === m.outreach_id) : undefined;
    return {
      id: m.id,
      role: m.role,
      text: m.text,
      status: m.status,
      failure_code: m.failure_code,
      client_message_id: m.client_message_id,
      options: m.ask?.options && !stale(m.created_at) ? m.ask.options : null,
      reply_to_id: m.reply_to_id,
      outreach: o
        ? {
            id: o.id,
            kind: o.kind,
            // Her own action's result is shown like Buddy's message (older apps know two origins).
            origin: o.origin === 'learner' ? 'buddy' : o.origin,
            title: o.title,
            body: o.body,
            why: o.why,
            status: o.status,
            send_at: iso(o.send_at),
            sent_at: iso(o.sent_at),
            opened_at: iso(o.opened_at),
            created_at: o.created_at.toISOString(),
          }
        : null,
      actions: actions
        .filter((a) => a.decision_id === m.decision_id)
        .map((a) => ({
          id: a.id,
          status: a.status,
          undoable: undoWorks.has(a.id) && !adultOnly.has(a.id),
          summary: servedSummary(a.result),
          created_at: a.created_at.toISOString(),
        })),
      created_at: m.created_at.toISOString(),
    };
  });
  return { messages, hasMore };
}

async function systemOf(
  deps: Deps,
  learnerId: string,
  state: BuddyState,
): Promise<BuddyHome['system']> {
  const now = deps.now();
  let push: BuddyHome['system']['push'] = 'disabled';
  if (deps.push.enabled) {
    const tokens = await deps.db.query<{ status: string }>(
      `select status from push_tokens where learner_id = $1`,
      [learnerId],
    );
    push = tokens.some((t) => t.status === 'active')
      ? 'active'
      : tokens.length > 0
        ? 'invalid'
        : 'no_token';
  }
  const hb = await deps.db.maybeOne<{ last_finished_at: Date | null }>(
    `select last_finished_at from system_heartbeats where name = 'tick'`,
  );
  const recent =
    !!hb?.last_finished_at && now.getTime() - hb.last_finished_at.getTime() < HEARTBEAT_STALE_MS;
  // Her own work waiting well past its time means nothing is running it — also when there has
  // never been a heartbeat (a misconfigured scheduler is not "unknown", audit M-67).
  const waiting = await deps.db.maybeOne(
    `select 1 from jobs where learner_id = $1 and status = 'queued' and run_at < $2 limit 1`,
    [learnerId, new Date(now.getTime() - HEARTBEAT_STALE_MS)],
  );
  const scheduler =
    waiting || (hb?.last_finished_at && !recent) ? 'stale' : recent ? 'ok' : 'unknown';
  // "Buddy can answer" only when a model is configured and today's allowance is not used up
  // (audit p2-F-journey-outage-invisible-on-home).
  const today = localParts(now, state.settings.timezone).date;
  const used = await deps.db.maybeOne<{ calls: number }>(
    `select calls from usage_daily where learner_id = $1 and day = $2 and kind = 'buddy_turn'`,
    [learnerId, today],
  );
  const model = deps.llm.available && (used?.calls ?? 0) < DAILY_LIMITS.buddy_turn;
  return {
    model,
    push,
    contact_enabled: state.settings.contact_enabled,
    scheduler,
  };
}
