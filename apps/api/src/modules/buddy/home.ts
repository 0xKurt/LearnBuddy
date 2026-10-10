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
  OutreachView,
  UpcomingItem,
} from '@learnbuddy/shared-types/contracts';

import { DAILY_LIMITS } from '../../config.js';
import type { Deps } from '../../deps.js';
import { daysBetween, localParts } from '../../lib/time.js';
import type { BuddyState, GoalRow } from './state.js';
import type { UndoSpec } from './toolKit.js';
import { undoApplies, undoLoosensContact } from './undo.js';
import { contextProvider } from './provider.js';
import { loadBuddyState, loadSettings } from './state.js';

const THREAD_LIMIT = 30;
const DONE_WINDOW_MS = 72 * 3_600_000;
const UNDO_WINDOW_MS = 7 * 86_400_000;
const HEARTBEAT_STALE_MS = 10 * 60_000;

type LearnerLite = { id: string; display_name: string; isMinor: boolean };

export function goalBrief(g: GoalRow, today: string): GoalBrief {
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

  // One after the other: they share the snapshot's connection. The card on top, the notice and
  // what is working are the domain's (provider.ts, issue #107).
  const domain = await contextProvider().home.screen(deps, learner.id, state, today, now);
  const decision = await decisionOf(state, learner, today, now);
  const done = await doneOf(deps, learner, now);
  const thread = await threadOf(deps, learner, beforeMessageId);
  const system = await systemOf(deps, learner.id, state);

  return {
    learner: { id: learner.id, name: learner.display_name, is_minor: learner.isMinor },
    ...domain,
    decision,
    done,
    next: nextOf(state, today, now),
    thread: thread.messages,
    thread_has_more: thread.hasMore,
    system,
    context_version: state.settings.context_version,
  };
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
  // Decided already — a no in the setup is final (owner 10.10., issue #518), and so is a change
  // in the settings: only a profile that was never asked hears the question here.
  const decided = s.contact_changed_at !== null;
  const somethingToFollow = state.totals.activeGoals > 0;
  if (!s.contact_enabled && !decided && !hidden && somethingToFollow) {
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
 * The card must say where the proposal stands, not where it stood when it was written
 * (issue #151): she may have answered it on another device, or the app was closed in
 * between. A row that is gone was deleted with what it proposed — the question is moot.
 */
function servedSummary(
  s: ActionSummary,
  pending: ReadonlyMap<string, PendingStatus>,
): ActionSummary {
  if (s.tool === 'confirm_delete')
    return { ...s, status: pending.get(s.pending_id) ?? 'superseded' };
  return s;
}

type PendingStatus = 'open' | 'confirmed' | 'declined' | 'expired' | 'superseded';

/** Where each proposed deletion on this page of the thread stands right now. */
async function pendingStatuses(
  deps: Deps,
  learnerId: string,
  summaries: readonly ActionSummary[],
  now: Date,
): Promise<Map<string, PendingStatus>> {
  const ids = summaries
    .filter(
      (s): s is Extract<ActionSummary, { tool: 'confirm_delete' }> => s.tool === 'confirm_delete',
    )
    .map((s) => s.pending_id);
  if (ids.length === 0) return new Map();
  const rows = await deps.db.query<{ id: string; status: PendingStatus; expires_at: Date }>(
    `select id, status, expires_at from buddy_pending_actions
      where learner_id = $1 and id = any($2::uuid[])`,
    [learnerId, ids],
  );
  return new Map(
    rows.map((r) => [
      r.id,
      // Read against the app's own clock, so a card does not offer a button that the
      // endpoint would refuse a moment later (CLAUDE.md rule 7).
      r.status === 'open' && r.expires_at.getTime() <= now.getTime() ? 'expired' : r.status,
    ]),
  );
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
      where learner_id = $1 and created_at > $2
        and tool not in ('offer_learning', 'offer_drill', 'open_area', 'start_roleplay', 'offer_rehearsal')
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
      // The day of a talk is a date like a test's, but nothing to take a test on (#264).
      kind: g.kind === 'talk' ? 'talk' : 'exam',
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
    roleplay_id: string | null;
    rehearsal_id: string | null;
    created_at: Date;
  }>(
    `select id, role, text, status, failure_code, client_message_id, ask, reply_to_id, outreach_id,
            decision_id, roleplay_id, rehearsal_id, created_at
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
        cannot_start_at: Date | null;
        created_at: Date;
      }>(
        `select id, decision_id, status, result, undo, cannot_start_at, created_at
           from buddy_actions
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
  // Quick answers belong to their moment: once she acted since (the domain says when — in
  // LearnBuddy: sent a photo, started a practice), they are gone (live finding 8).
  const domain = contextProvider().home;
  const acted = await domain.lastActed(deps.db, learnerId);
  const stale = (at: Date) => acted !== null && acted.getTime() > at.getTime();
  const pending = await pendingStatuses(
    deps,
    learnerId,
    actions.map((a) => a.result),
    now,
  );
  // What the domain's cards and messages on this page say now.
  const dress = await domain.thread(deps.db, learnerId, { messages: page, actions }, now);
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
          summary: servedSummary(dress.summary(a.id, a.result), pending),
          created_at: a.created_at.toISOString(),
        })),
      ...dress.message(m),
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
