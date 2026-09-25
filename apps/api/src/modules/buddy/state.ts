// Loads everything Buddy knows about one learner, in one place, for the
// model context, the home screen and deterministic decisions. All queries are
// scoped by learner_id; nothing here trusts client input.

import type { Db } from '../../lib/db.js';

export type SettingsRow = {
  learner_id: string;
  timezone: string;
  contact_enabled: boolean;
  contact_changed_by: 'learner' | 'account_holder' | null;
  quiet_start: string;
  quiet_end: string;
  preferred_start: string;
  preferred_end: string;
  avoid_weekdays: number[];
  max_per_day: number;
  max_per_week: number;
  paused_until: Date | null;
  opt_in_prompt_hidden_until: Date | null;
  context_version: number;
  last_seen_at: Date | null;
  version: number;
};

export type GoalRow = {
  id: string;
  kind: 'exam' | 'topic';
  title: string;
  subject_id: string | null;
  subject_name: string | null;
  due_date: string | null;
  topics: string[];
  status: 'active' | 'done' | 'dropped';
  outcome: 'good' | 'ok' | 'hard' | null;
  version: number;
  created_at: Date;
  closed_at: Date | null;
};

export type StepPayload = {
  item_ids?: string[];
  est_minutes?: number;
  focus_topics?: string[];
  subject_id?: string | null;
};

export type StepRow = {
  id: string;
  goal_id: string | null;
  kind: 'practice' | 'capture';
  title: string;
  state: 'planned' | 'prepared' | 'in_progress' | 'done' | 'skipped' | 'cancelled';
  planned_date: string | null;
  planned_time: string | null;
  agreed: boolean;
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
  source: 'learner_stated' | 'learner_edited' | 'account_holder';
  quote: string | null;
  valid_until: Date | null;
  version: number;
  created_at: Date;
};

export type MessageRow = {
  id: string;
  role: 'learner' | 'buddy';
  text: string;
  status: 'processing' | 'done' | 'failed';
  reply_to_id: string | null;
  ask: { options: string[] } | null;
  outreach_id: string | null;
  decision_id: string | null;
  created_at: Date;
};

export type SubjectRow = {
  id: string;
  name: string;
  kind: string;
  item_count: number;
  material_count: number;
};

export type TopicProgress = {
  subject_id: string | null;
  topic: string;
  total: number;
  seen: number;
  /** Last practice right on the first try, and not yet due for a refresh. */
  secure: number;
  /** Last practice needed help or the solution. */
  shaky: number;
  /** Was secure, but spaced repetition says it is time to refresh it. */
  due: number;
};

export type MaterialBrief = {
  id: string;
  title: string | null;
  status: 'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'failed';
  failure_reason: string | null;
  subject_id: string | null;
  goal_id: string | null;
  item_count: number;
  created_at: Date;
};

export type SessionBrief = {
  id: string;
  mode: 'practice' | 'test' | 'help' | 'explain';
  /** Topic and homework sessions carry their own title. */
  title: string | null;
  status: 'active' | 'finished' | 'abandoned';
  goal_id: string | null;
  step_id: string | null;
  started_at: Date;
  finished_at: Date | null;
  total: number;
  answered: number;
  first_try: number;
  secure_topics: string[];
  shaky_topics: string[];
};

export type OutreachRow = {
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

export type BuddyState = {
  settings: SettingsRow;
  goals: GoalRow[];
  steps: StepRow[];
  memories: MemoryRow[];
  messages: MessageRow[];
  subjects: SubjectRow[];
  topics: TopicProgress[];
  materials: MaterialBrief[];
  sessions: SessionBrief[];
  outreach: OutreachRow[];
  /** Totals irrespective of the bounded lists (coverage signals). */
  totals: { activeGoals: number; openSteps: number; memories: number; items: number };
};

export const LIMITS = {
  messages: 24,
  goals: 12,
  steps: 20,
  memories: 60,
  subjects: 20,
  topics: 40,
  materials: 10,
  sessions: 5,
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

export async function loadBuddyState(db: Db, learnerId: string, now: Date): Promise<BuddyState> {
  const settings = await loadSettings(db, learnerId);

  const goals = await db.query<GoalRow>(
    `select g.id, g.kind, g.title, g.subject_id, s.name as subject_name, g.due_date, g.topics,
            g.status, g.outcome, g.version, g.created_at, g.closed_at
       from buddy_goals g left join subjects s on s.id = g.subject_id
      where g.learner_id = $1
        and (g.status = 'active' or g.closed_at > $2::timestamptz - interval '14 days')
      order by (g.status = 'active') desc, g.due_date nulls last, g.created_at
      limit $3`,
    [learnerId, now, LIMITS.goals],
  );

  const steps = await db.query<StepRow>(
    `select id, goal_id, kind, title, state, planned_date, planned_time, agreed, payload, evidence,
            done_source, version, created_at, finished_at
       from buddy_steps
      where learner_id = $1
        and (state in ('planned','prepared','in_progress')
             or finished_at > $2::timestamptz - interval '7 days')
      order by (state in ('planned','prepared','in_progress')) desc, planned_date nulls last, created_at
      limit $3`,
    [learnerId, now, LIMITS.steps],
  );

  const memories = await db.query<MemoryRow>(
    `select id, kind, statement, source, quote, valid_until, version, created_at
       from buddy_memories
      where learner_id = $1 and status = 'active' and (valid_until is null or valid_until > $2)
      order by created_at
      limit $3`,
    [learnerId, now, LIMITS.memories + 1],
  );

  const messages = (
    await db.query<MessageRow>(
      `select id, role, text, status, reply_to_id, ask, outreach_id, decision_id, created_at
         from buddy_messages where learner_id = $1
        order by seq desc
        limit $2`,
      [learnerId, LIMITS.messages],
    )
  ).reverse();

  const subjects = await db.query<SubjectRow>(
    `select s.id, s.name, s.kind,
            (select count(*) from items i where i.subject_id = s.id and i.archived_at is null)::int as item_count,
            (select count(*) from materials m where m.subject_id = s.id and m.archived_at is null)::int as material_count
       from subjects s
      where s.learner_id = $1 and s.archived_at is null
      order by s.created_at
      limit $2`,
    [learnerId, LIMITS.subjects],
  );

  // Topic progress from how the last practice of each question went, and
  // whether spaced repetition considers it due again.
  const topics = await db.query<TopicProgress>(
    `select i.subject_id, coalesce(i.topic, '') as topic,
            count(*)::int as total,
            count(st.item_id)::int as seen,
            count(*) filter (where st.last_outcome = 'first_try' and st.due > $3)::int as secure,
            count(*) filter (where st.last_outcome in ('with_help','revealed'))::int as shaky,
            count(*) filter (where st.last_outcome = 'first_try' and st.due <= $3)::int as due
       from items i left join item_states st on st.item_id = i.id
      where i.learner_id = $1 and i.archived_at is null
      group by i.subject_id, coalesce(i.topic, '')
      order by count(*) desc
      limit $2`,
    [learnerId, LIMITS.topics, now],
  );

  const materials = await db.query<MaterialBrief>(
    `select m.id, m.title, m.status, m.failure_reason, m.subject_id, m.goal_id, m.created_at,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as item_count
       from materials m
      where m.learner_id = $1 and m.archived_at is null
      order by m.created_at desc
      limit $2`,
    [learnerId, LIMITS.materials],
  );

  const sessions = await db.query<SessionBrief>(
    `select ps.id, ps.status, ps.goal_id, ps.step_id, ps.started_at, ps.finished_at, ps.mode, ps.title,
            count(si.item_id)::int as total,
            count(*) filter (where si.status <> 'open')::int as answered,
            count(*) filter (where si.first_try_correct)::int as first_try,
            coalesce(array_agg(distinct i.topic) filter (
              where si.status = 'correct' and si.hints_used = 0 and i.topic is not null), '{}') as secure_topics,
            coalesce(array_agg(distinct i.topic) filter (
              where si.status in ('revealed','skipped','missed') or si.hints_used > 0), '{}') as shaky_topics
       from practice_sessions ps
       left join session_items si on si.session_id = ps.id
       left join items i on i.id = si.item_id
      where ps.learner_id = $1
      group by ps.id
      order by ps.started_at desc
      limit $2`,
    [learnerId, LIMITS.sessions],
  );

  const outreach = await db.query<OutreachRow>(
    `select id, kind, origin, topic_key, title, body, why, status, send_at, sent_at, opened_at,
            responded_at, response, goal_id, step_id, created_at
       from buddy_outreach
      where learner_id = $1 and created_at > $2::timestamptz - make_interval(days => $3)
      order by created_at desc`,
    [learnerId, now, LIMITS.outreachDays],
  );

  const totals = await db.one<{ goals: number; steps: number; memories: number; items: number }>(
    `select
       (select count(*) from buddy_goals where learner_id = $1 and status = 'active')::int as goals,
       (select count(*) from buddy_steps where learner_id = $1 and state in ('planned','prepared','in_progress'))::int as steps,
       (select count(*) from buddy_memories where learner_id = $1 and status = 'active'
          and (valid_until is null or valid_until > $2))::int as memories,
       (select count(*) from items where learner_id = $1 and archived_at is null)::int as items`,
    [learnerId, now],
  );

  return {
    settings,
    goals,
    steps,
    memories,
    messages,
    subjects,
    topics,
    materials,
    sessions,
    outreach,
    totals: {
      activeGoals: totals.goals,
      openSteps: totals.steps,
      memories: totals.memories,
      items: totals.items,
    },
  };
}
