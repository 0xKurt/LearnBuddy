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
  NowCard,
  OutreachView,
  UpcomingItem,
} from '@learnbuddy/shared-types/contracts';

import type { Deps } from '../../deps.js';
import { daysBetween, localParts } from '../../lib/time.js';
import type { BuddyState, GoalRow } from './state.js';
import { undoApplies, type UndoSpec } from './tools.js';
import { loadBuddyState } from './state.js';

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
  const now = deps.now();
  const state = await loadBuddyState(deps.db, learner.id, now);
  const tz = state.settings.timezone;
  const today = localParts(now, tz).date;

  const [nowCard, decision, done, thread, system, working] = await Promise.all([
    nowCardOf(deps, learner.id, state, today, now),
    decisionOf(state, learner, today, now),
    doneOf(deps, learner.id, now),
    threadOf(deps, learner.id, beforeMessageId),
    systemOf(deps, learner.id, state),
    workingOf(deps, learner.id, now),
  ]);

  return {
    learner: { id: learner.id, name: learner.display_name, is_minor: learner.isMinor },
    now: nowCard,
    decision,
    done,
    next: nextOf(state, today, now),
    thread: thread.messages,
    thread_has_more: thread.hasMore,
    system,
    working,
    context_version: state.settings.context_version,
  };
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

async function nowCardOf(
  deps: Deps,
  learnerId: string,
  state: BuddyState,
  today: string,
  now: Date,
): Promise<NowCard | null> {
  // Pages Buddy could not read come first while the sheet is still at hand: the
  // rest of it is ready (and a homework help session waits), but Lena should
  // know what is missing (docs/architecture.md §Material).
  const missing = state.materials.find(
    (m) =>
      m.status === 'ready' &&
      m.page_problems.length > 0 &&
      now.getTime() - m.created_at.getTime() < 24 * 3_600_000,
  );
  if (missing) {
    return {
      type: 'pages_missing',
      material_id: missing.id,
      title: missing.title,
      photo_count: missing.photo_count,
      pages: missing.page_problems,
    };
  }
  const active = state.sessions.find(
    (s) =>
      s.status === 'active' &&
      now.getTime() - s.started_at.getTime() < 12 * 3_600_000 &&
      s.answered < s.total,
  );
  if (active) {
    const goal = active.goal_id ? state.goals.find((g) => g.id === active.goal_id) : undefined;
    const step = active.step_id ? state.steps.find((s) => s.id === active.step_id) : undefined;
    return {
      type: 'resume_practice',
      session_id: active.id,
      mode: active.mode,
      title: active.title ?? goal?.title ?? step?.title ?? '',
      remaining: active.total - active.answered,
    };
  }
  const justFinished = state.sessions.find(
    (s) =>
      s.status === 'finished' &&
      // Left without answering anything: nothing to celebrate or report.
      s.answered > 0 &&
      s.finished_at &&
      now.getTime() - s.finished_at.getTime() < 30 * 60_000,
  );
  if (justFinished) {
    return {
      type: 'practice_result',
      session_id: justFinished.id,
      result: {
        answered: justFinished.answered,
        first_try: justFinished.first_try,
        secure_topics: justFinished.secure_topics,
        shaky_topics: justFinished.shaky_topics,
      },
    };
  }
  const prepared = state.steps
    .filter(
      (s) =>
        s.kind === 'practice' && s.state === 'prepared' && (s.payload.item_ids?.length ?? 0) > 0,
    )
    .sort((a, b) => {
      const ga = state.goals.find((g) => g.id === a.goal_id)?.due_date ?? '9999-12-31';
      const gb = state.goals.find((g) => g.id === b.goal_id)?.due_date ?? '9999-12-31';
      return ga < gb ? -1 : ga > gb ? 1 : 0;
    })[0];
  if (prepared) {
    const goal = prepared.goal_id ? state.goals.find((g) => g.id === prepared.goal_id) : undefined;
    return {
      type: 'practice_ready',
      step_id: prepared.id,
      title: prepared.title,
      question_count: prepared.payload.item_ids?.length ?? 0,
      est_minutes: prepared.payload.est_minutes ?? 10,
      focus_topics: prepared.payload.focus_topics ?? [],
      goal: goal ? goalBrief(goal, today) : null,
    };
  }
  const failed = state.materials.find(
    (m) => m.status === 'failed' && now.getTime() - m.created_at.getTime() < 24 * 3_600_000,
  );
  if (failed) {
    const attempts = await deps.db.maybeOne<{ n: number }>(
      `select count(*)::int as n from jobs where learner_id = $1 and kind = 'extract_material'
          and payload ->> 'material_id' = $2`,
      [learnerId, failed.id],
    );
    return {
      type: 'material_failed',
      material_id: failed.id,
      reason: failed.failure_reason,
      retryable: failed.failure_reason !== 'not_learning_material' && (attempts?.n ?? 0) < 3,
    };
  }
  // Photos still on their way count only briefly: an upload the app gave up on is not
  // "being sent" for hours (and Buddy then still asks for the photo).
  const processing = state.materials.find((m) => {
    const age = now.getTime() - m.created_at.getTime();
    if (m.status === 'awaiting_upload') return age < UPLOAD_WINDOW_MS;
    return (m.status === 'queued' || m.status === 'processing') && age < 2 * 3_600_000;
  });
  if (processing) {
    return {
      type: 'material_processing',
      material_id: processing.id,
      status: processing.status as 'awaiting_upload' | 'queued' | 'processing',
    };
  }
  const capture = state.steps.find((s) => s.kind === 'capture' && s.state === 'planned');
  if (capture) {
    const goal = capture.goal_id ? state.goals.find((g) => g.id === capture.goal_id) : undefined;
    return {
      type: 'capture_needed',
      step_id: capture.id,
      title: capture.title,
      goal: goal ? goalBrief(goal, today) : null,
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
    return { type: 'contact_opt_in', can_enable_here: !learner.isMinor };
  }
  return null;
}

async function doneOf(deps: Deps, learnerId: string, now: Date): Promise<ActionView[]> {
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
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      status: r.status,
      // Offered only when it would work now (nothing changed since).
      undoable:
        r.status === 'applied' &&
        r.undo !== null &&
        now.getTime() - r.created_at.getTime() < UNDO_WINDOW_MS &&
        (await undoApplies(deps.db, learnerId, r.undo)),
      summary: r.result,
      created_at: r.created_at.toISOString(),
    })),
  );
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
    if (s.state !== 'planned' || !s.planned_date || daysBetween(today, s.planned_date) < 0)
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
  learnerId: string,
  beforeMessageId?: string,
): Promise<{ messages: MessageView[]; hasMore: boolean }> {
  const rows = await deps.db.query<{
    id: string;
    role: 'learner' | 'buddy';
    text: string;
    status: 'processing' | 'done' | 'failed';
    client_message_id: string | null;
    ask: { options?: string[] } | null;
    reply_to_id: string | null;
    outreach_id: string | null;
    decision_id: string | null;
    created_at: Date;
  }>(
    `select id, role, text, status, client_message_id, ask, reply_to_id, outreach_id, decision_id, created_at
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
        undo: unknown;
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
        origin: OutreachView['origin'];
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

  const messages: MessageView[] = page.map((m) => {
    const o = m.outreach_id ? outreach.find((x) => x.id === m.outreach_id) : undefined;
    return {
      id: m.id,
      role: m.role,
      text: m.text,
      status: m.status,
      client_message_id: m.client_message_id,
      options: m.ask?.options ?? null,
      reply_to_id: m.reply_to_id,
      outreach: o
        ? {
            id: o.id,
            kind: o.kind,
            origin: o.origin,
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
          undoable:
            a.status === 'applied' &&
            a.undo !== null &&
            now.getTime() - a.created_at.getTime() < UNDO_WINDOW_MS,
          summary: a.result,
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
  const scheduler = !hb?.last_finished_at
    ? 'unknown'
    : now.getTime() - hb.last_finished_at.getTime() < HEARTBEAT_STALE_MS
      ? 'ok'
      : 'stale';
  return {
    model: deps.llm.available,
    push,
    contact_enabled: state.settings.contact_enabled,
    scheduler,
  };
}
