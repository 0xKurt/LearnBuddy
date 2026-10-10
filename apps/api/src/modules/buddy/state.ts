// Loads everything Buddy knows about one learner, in one place, for the
// model context, the home screen and deterministic decisions. All queries are
// scoped by learner_id; nothing here trusts client input.
//
// The core reads its own tables here; what a domain knows about her (LearnBuddy: her subjects,
// sheets and practices) comes from its context provider (provider.ts, issue #107), read with the
// same connection so a snapshot covers both.

import type { VoiceName } from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { contextProvider } from './provider.js';

export type SettingsRow = {
  learner_id: string;
  timezone: string;
  contact_enabled: boolean;
  contact_changed_by: 'learner' | 'account_holder' | null;
  /**
   * When contact was last decided on purpose — in the setup (issue #518), in the settings or by
   * the chat's own question. Null: never asked, the one case the chat may ask in.
   */
  contact_changed_at: Date | null;
  quiet_start: string;
  quiet_end: string;
  preferred_start: string;
  preferred_end: string;
  avoid_weekdays: number[];
  paused_until: Date | null;
  /** "Seltener schreiben": Buddy's own initiatives reach the phone only when important. */
  phone_only_important: boolean;
  opt_in_prompt_hidden_until: Date | null;
  context_version: number;
  last_seen_at: Date | null;
  version: number;
  /** Buddy's voice when read aloud (ADR 0008). */
  voice: VoiceName;
  /** -2 … +2 steps from the normal speed. */
  voice_speed: number;
  /** Which worker runs this learner's background checks (check.ts), if any. */
  check_lease_token?: string | null;
};

export type GoalRow = {
  id: string;
  /** talk: a Referat, GFS, presentation or recital with its own steps (issue #264). */
  kind: 'exam' | 'topic' | 'talk';
  /** talk: how long it must be, in minutes, when she said so. */
  talk_minutes?: number | null;
  title: string;
  subject_id: string | null;
  /** Named by the domain's subjects (provider.ts); the goal keeps only the id. */
  subject_name: string | null;
  due_date: string | null;
  topics: string[];
  status: 'active' | 'done' | 'dropped';
  outcome: 'good' | 'ok' | 'hard' | null;
  version: number;
  created_at: Date;
  closed_at: Date | null;
};

type StepPayload = {
  item_ids?: string[];
  est_minutes?: number;
  focus_topics?: string[];
  subject_id?: string | null;
  /** capture: the sheet this page joins, when it completes one she already sent (issue #118). */
  completes?: string;
  /** task: which step of a talk it is (issue #264). */
  stage?: 'topic' | 'outline' | 'sources' | 'slides' | 'rehearsal';
};

export type StepRow = {
  id: string;
  goal_id: string | null;
  /** task: a step of a talk she does herself (issue #264). */
  kind: 'practice' | 'capture' | 'task';
  title: string;
  state: 'planned' | 'prepared' | 'in_progress' | 'done' | 'skipped' | 'cancelled';
  planned_date: string | null;
  planned_time: string | null;
  agreed: boolean;
  /** A standing arrangement: the step moves itself on after each reminder (issue #112). */
  repeat: 'daily' | 'weekdays' | 'weekly' | null;
  repeat_until: string | null;
  payload: StepPayload;
  evidence: Record<string, unknown> | null;
  done_source: 'evidence' | 'learner_reported' | null;
  version: number;
  created_at: Date;
  finished_at: Date | null;
};

export type MemoryRow = {
  id: string;
  kind: 'fact' | 'preference' | 'goal' | 'constraint';
  statement: string;
  source: 'learner_stated' | 'learner_edited' | 'account_holder' | 'consolidated';
  quote: string | null;
  valid_until: Date | null;
  version: number;
  created_at: Date;
};

/** Two to four sentences about a conversation that ended (issue #22). */
type DaySummaryRow = {
  day: string;
  summary: string;
  topics: string[];
};

export type MessageRow = {
  /** Why a model may not be told this message's words again (modules/buddy/recall.ts, #149). */
  recall_block: 'blocked' | 'concern' | null;
  id: string;
  role: 'learner' | 'buddy';
  text: string;
  status: 'processing' | 'done' | 'failed';
  /** Why a learner message failed or was held back (migration 0020). */
  failure_code: string | null;
  reply_to_id: string | null;
  ask: { options: string[] } | null;
  outreach_id: string | null;
  decision_id: string | null;
  created_at: Date;
};

type OutreachRow = {
  id: string;
  kind: 'idea' | 'reminder' | 'checkin' | 'result';
  origin: 'agreed' | 'buddy';
  topic_key: string;
  title: string;
  body: string;
  why: string | null;
  status: string;
  send_at: Date | null;
  sent_at: Date | null;
  opened_at: Date | null;
  responded_at: Date | null;
  response: string | null;
  goal_id: string | null;
  step_id: string | null;
  created_at: Date;
};

/**
 * What a registered domain adds to Buddy's state: it declares its fields by augmenting this
 * interface (`declare module`, LearnBuddy: modules/learning/state.ts) and loads them through its
 * context provider (provider.ts). The core carries them; only the domain reads them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by the domain's augmentation
export interface DomainState {}

/** Totals a registered domain adds (it augments this interface like `DomainState`). */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by the domain's augmentation
export interface DomainTotals {}

type CoreState = {
  settings: SettingsRow;
  goals: GoalRow[];
  steps: StepRow[];
  memories: MemoryRow[];
  messages: MessageRow[];
  /** What the days before were about, newest last (issue #22). */
  summaries: DaySummaryRow[];
  outreach: OutreachRow[];
  /** Totals irrespective of the bounded lists (coverage signals). */
  totals: { activeGoals: number; openSteps: number; memories: number } & DomainTotals;
};

export type BuddyState = CoreState & DomainState;

/** A turn still "processing" after this long is considered interrupted. */
export const TURN_STALL_MS = 3 * 60_000;

export const LIMITS = {
  messages: 24,
  /** Conversations of earlier days that travel in the context, newest first. */
  summaries: 10,
  goals: 12,
  steps: 20,
  memories: 60,
  outreachDays: 14,
} as const;

export async function loadSettings(db: Db, learnerId: string): Promise<SettingsRow> {
  const row = await db.maybeOne<SettingsRow>(`select * from buddy_settings where learner_id = $1`, [
    learnerId,
  ]);
  if (row) return row;
  return db.one<SettingsRow>(
    `insert into buddy_settings (learner_id) values ($1)
     on conflict (learner_id) do update set learner_id = excluded.learner_id
     returning *`,
    [learnerId],
  );
}

/** Goals with the names of their subjects, which the domain keeps (provider.ts). */
export async function withSubjectNames<G extends Omit<GoalRow, 'subject_name'>>(
  db: Db,
  learnerId: string,
  goals: G[],
): Promise<Array<G & Pick<GoalRow, 'subject_name'>>> {
  const ids = goals.flatMap((g) => (g.subject_id ? [g.subject_id] : []));
  const names = ids.length
    ? await contextProvider().subjects.names(db, learnerId, ids)
    : new Map<string, string>();
  return goals.map((g) => ({
    ...g,
    subject_name: g.subject_id ? (names.get(g.subject_id) ?? null) : null,
  }));
}

export async function loadBuddyState(db: Db, learnerId: string, now: Date): Promise<BuddyState> {
  const provider = contextProvider();
  const settings = await loadSettings(db, learnerId);

  const goals = await withSubjectNames(
    db,
    learnerId,
    await db.query<Omit<GoalRow, 'subject_name'>>(
      `select g.id, g.kind, g.title, g.subject_id, g.due_date, g.topics,
              g.status, g.outcome, g.version, g.created_at, g.closed_at, g.talk_minutes
         from buddy_goals g
        where g.learner_id = $1
          and (g.status = 'active' or g.closed_at > $2::timestamptz - interval '14 days')
        order by (g.status = 'active') desc, g.due_date nulls last, g.created_at, g.seq
        limit $3`,
      [learnerId, now, LIMITS.goals],
    ),
  );

  const steps = await db.query<StepRow>(
    `select id, goal_id, kind, title, state, planned_date, planned_time, agreed, payload, evidence,
            done_source, version, created_at, finished_at,
            -- Declared on StepRow since #112 and never selected, so st.repeat was
            -- undefined at run time and Buddy forgot every rhythm the moment the chat
            -- window moved past it (external audit F7, issue #152). db.query<StepRow> is
            -- an unchecked claim: a type annotation does not check SQL columns.
            repeat, repeat_until
       from buddy_steps
      where learner_id = $1
        and (state in ('planned','prepared','in_progress')
             or finished_at > $2::timestamptz - interval '7 days')
      order by (state in ('planned','prepared','in_progress')) desc, planned_date nulls last, created_at, seq
      limit $3`,
    [learnerId, now, LIMITS.steps],
  );

  const memories = await db.query<MemoryRow>(
    `select id, kind, statement, source, quote, valid_until, version, created_at
       from buddy_memories
      where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)
      order by created_at, seq
      limit $3`,
    [learnerId, now, LIMITS.memories + 1],
  );

  const messages = (
    await db.query<MessageRow>(
      `select id, role, text, status, failure_code, recall_block, reply_to_id, ask, outreach_id,
              decision_id, created_at
         from buddy_messages where learner_id = $1
        order by seq desc
        limit $2`,
      [learnerId, LIMITS.messages],
    )
  ).reverse();

  // What the days before were about: cheap tokens where a longer message list would be
  // expensive and still lose the shape of a day (issue #22, modules/buddy/summarise.ts).
  const summaries = (
    await db.query<DaySummaryRow>(
      `select to_char(day, 'YYYY-MM-DD') as day, summary, topics from buddy_session_summaries
        where learner_id = $1 and summary <> '—'
        order by ended_at desc
        limit $2`,
      [learnerId, LIMITS.summaries],
    )
  ).reverse();

  // What the domain knows about her.
  const { totals: domainTotals, ...domain } = await provider.state.load(db, learnerId, now);

  const outreach = await db.query<OutreachRow>(
    `select id, kind, origin, topic_key, title, body, why, status, send_at, sent_at, opened_at,
            responded_at, response, goal_id, step_id, created_at
       from buddy_outreach
      where learner_id = $1 and created_at > $2::timestamptz - make_interval(days => $3)
      order by created_at desc, seq desc`,
    [learnerId, now, LIMITS.outreachDays],
  );

  const totals = await db.one<{ goals: number; steps: number; memories: number }>(
    `select
       (select count(*) from buddy_goals where learner_id = $1 and status = 'active')::int as goals,
       (select count(*) from buddy_steps where learner_id = $1 and state in ('planned','prepared','in_progress'))::int as steps,
       (select count(*) from buddy_memories where learner_id = $1 and status = 'active'
          and (valid_until is null or valid_until > $2))::int as memories`,
    [learnerId, now],
  );

  return {
    settings,
    goals,
    steps,
    memories,
    messages,
    summaries,
    ...domain,
    outreach,
    totals: {
      activeGoals: totals.goals,
      openSteps: totals.steps,
      memories: totals.memories,
      ...domainTotals,
    },
  };
}
