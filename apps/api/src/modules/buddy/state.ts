// Loads everything Buddy knows about one learner, in one place, for the
// model context, the home screen and deterministic decisions. All queries are
// scoped by learner_id; nothing here trusts client input.

import type {
  ActionSummary,
  DifficultyWish,
  NotPracticable,
  PageProblem,
  TestMinutes,
  VocabDirection,
  VoiceName,
} from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import { summarize, type SummaryRow } from '../practice/summary.js';

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
  /** capture: the sheet this page joins, when it completes one she already sent (issue #118). */
  completes?: string;
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
export type DaySummaryRow = {
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

/** What she is working on, held across turns and restarts (issue #160). */
export type FocusRow = {
  material_id: string | null;
  material_title: string | null;
  subject_id: string | null;
  subject_name: string | null;
  goal_id: string | null;
  goal_title: string | null;
  vocabulary_only: boolean;
  direction: 'recognise' | 'produce' | null;
  said: string | null;
  updated_at: Date;
};

/**
 * One spot on a sheet that could not be read, as Buddy sees it (issue #164 point 1,
 * migration 0070). He may ask about it in his own words — the app asks it as a card with the
 * readings to tap, and both say the same thing, as with the pages that could not be read.
 */
export type UnclearSpotBrief = {
  /** The alias her answer names ('u1'); the server resolves it (CLAUDE.md rule 2). */
  ref: string;
  /**
   * The material whose PHOTOS hold the spot — the sheet itself, unless these pages were added
   * to an earlier one. The app shows that page from its own copy on the phone, so it has to be
   * the right material or she would be looking at another page of her sheet.
   */
  material_id: string;
  page: number;
  /** How many pages that material has, so "page 2" is only said where there are several. */
  photo_count: number;
  /** The task as printed, so he can say WHICH one in the words she read on her sheet. */
  task: string;
  about: string;
  readings: string[];
  /**
   * open: the ask stands · answered: she picked one and the question is being written ·
   * read: the reading ran and added nothing (`items_added` 0) — said out loud, never swallowed.
   */
  status: 'open' | 'answered' | 'read';
  /** The reading she confirmed, once she has. */
  answer: string | null;
  items_added: number;
};

export type MaterialBrief = {
  id: string;
  title: string | null;
  status: 'awaiting_upload' | 'queued' | 'processing' | 'ready' | 'failed';
  failure_reason: string | null;
  subject_id: string | null;
  goal_id: string | null;
  item_count: number;
  photo_count: number;
  /** Pages not read completely that Lena has not answered yet (resolved: empty). */
  page_problems: PageProblem[];
  /** The sheet holds more questions than were read into items (issue #150). */
  items_incomplete: boolean;
  /**
   * Tasks on the sheet that got no questions because their exercise form is not one Buddy
   * can practise (issue #198). Buddy names them instead of letting the sheet look done.
   */
  not_practicable: NotPracticable[];
  /**
   * Spots the reading could not settle, where the smallest clarification is to ask HER
   * (issue #164 point 1). Empty for almost every sheet.
   */
  unclear: UnclearSpotBrief[];
  created_at: Date;
  /**
   * When the reading failed (migration 0056). A send given up after a day fails a full day
   * after `created_at`, so "failed recently" can only be read from this (issue #115).
   */
  failed_at: Date | null;
};

export type SessionBrief = {
  id: string;
  mode: 'practice' | 'test' | 'help';
  /** Topic and homework sessions carry their own title. */
  title: string | null;
  status: 'active' | 'finished' | 'abandoned';
  goal_id: string | null;
  step_id: string | null;
  started_at: Date;
  /** Resuming is keyed on this, not on started_at (audit H-7; practice/lifecycle.ts). */
  last_activity_at: Date;
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

/** What the offer card in the chat carries (`ActionSummary`, `components/learn/OfferCard.tsx`). */
type OfferSummary = Extract<ActionSummary, { tool: 'offer_learning' }>;

/**
 * An offer of Buddy's that is still standing: the button sits in the conversation and one tap
 * starts it — the offer's action id is the app's request id, so the same offer always opens the
 * same session (`OfferCard.tsx`, `practice/prepare.ts`).
 *
 * Without this in STATE Buddy could not see his own offer still standing, and offered the same
 * practice again turn after turn — no single answer wrong, the conversation treading water
 * (measured 01.10., issues #184 and #127).
 *
 * "Not taken up" is read from the session, never from the offer: what Buddy offers is prepared
 * in the background under that same action id (issue #48), so a session existing proves nothing
 * about her — only work in it does (CLAUDE.md rule 5).
 */
export type StandingOffer = {
  /** The offer's action id; the app starts its session under it. */
  id: string;
  kind: OfferSummary['kind'];
  /** What was offered, in the learner's own words, as the card says it. */
  text: string;
  goal_id: string | null;
  /** A Diktat's sheet (issue #242); absent or null for every other offer. */
  material_id?: string | null;
  difficulty: DifficultyWish | null;
  direction: VocabDirection | null;
  /** A test she asked to sit with time: its minutes (issue #241); null without a clock. */
  minutes: TestMinutes | null;
  created_at: Date;
};

export type BuddyState = {
  settings: SettingsRow;
  goals: GoalRow[];
  steps: StepRow[];
  memories: MemoryRow[];
  messages: MessageRow[];
  /** What the days before were about, newest last (issue #22). */
  summaries: DaySummaryRow[];
  subjects: SubjectRow[];
  topics: TopicProgress[];
  materials: MaterialBrief[];
  /** What she is working on, or null while nothing has been agreed (issue #160). */
  focus: FocusRow | null;
  sessions: SessionBrief[];
  /** Offers of his she has not taken up yet, oldest first (issue #184). */
  standing: StandingOffer[];
  outreach: OutreachRow[];
  /** Totals irrespective of the bounded lists (coverage signals). */
  totals: {
    activeGoals: number;
    openSteps: number;
    memories: number;
    items: number;
    /** All her sheets, not only the newest ones in `materials` (issue #49). */
    materials: number;
  };
};

/** A turn still "processing" after this long is considered interrupted. */
export const TURN_STALL_MS = 3 * 60_000;

// Questions here are what practice can use: homework tasks belong to their help session
// and are never counted as practice questions (p2-HW-06).
export const LIMITS = {
  messages: 24,
  /** Conversations of earlier days that travel in the context, newest first. */
  summaries: 10,
  goals: 12,
  steps: 20,
  memories: 60,
  subjects: 20,
  topics: 40,
  materials: 10,
  sessions: 5,
  outreachDays: 14,
  /** Offers still standing; more than a handful is not a list the model needs to read. */
  standing: 5,
} as const;

/**
 * How long an offer she has not taken up still counts as standing. Its button never stops
 * working, but a day is as far back as "right there in front of her" reaches honestly.
 */
export const STANDING_WINDOW_MS = 24 * 3_600_000;

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

/**
 * Offers of Buddy's she has not taken up (issue #184), oldest first.
 *
 * Taken up means worked in, not prepared: the row `practice_sessions` gets under the offer's
 * action id may have been written by the background preparation seconds after the offer
 * (`practice/prepare.ts`), so only an answered, tried or revealed question — or a session that
 * is no longer active — proves she started it.
 */
export async function loadStandingOffers(
  db: Db,
  learnerId: string,
  now: Date,
): Promise<StandingOffer[]> {
  const rows = await db.query<{
    id: string;
    // Read back raw: rows written before a field existed simply do not carry it (the
    // contract's zod defaults never ran on this path), so every one is normalised below.
    result: {
      kind: OfferSummary['kind'];
      text: string;
      goal_id?: string | null;
      material_id?: string | null;
      difficulty?: DifficultyWish | null;
      direction?: VocabDirection | null;
      minutes?: TestMinutes | null;
    };
    created_at: Date;
  }>(
    `select a.id, a.result, a.created_at
       from buddy_actions a
      where a.learner_id = $1 and a.tool = 'offer_learning' and a.status = 'applied'
        -- A button whose questions could not be written is nothing waiting for her, however
        -- untouched it looks (issue #196). Saying otherwise sent Buddy on to point at a card
        -- that cannot start — rule 5 inside the state he reads.
        and a.cannot_start_at is null
        and a.created_at > $2
        and not exists (
          select 1 from practice_sessions ps
           where ps.learner_id = a.learner_id and ps.client_request_id = a.id
             and (ps.status <> 'active'
                  or exists (select 1 from session_items si
                              where si.session_id = ps.id
                                and (si.status <> 'open' or si.attempts > 0))))
      order by a.seq desc
      limit $3`,
    [learnerId, new Date(now.getTime() - STANDING_WINDOW_MS), LIMITS.standing],
  );
  return rows.reverse().map((r) => ({
    id: r.id,
    kind: r.result.kind,
    text: r.result.text,
    goal_id: r.result.goal_id ?? null,
    material_id: r.result.material_id ?? null,
    difficulty: r.result.difficulty ?? null,
    direction: r.result.direction ?? null,
    minutes: r.result.minutes ?? null,
    created_at: r.created_at,
  }));
}

export async function loadBuddyState(db: Db, learnerId: string, now: Date): Promise<BuddyState> {
  const settings = await loadSettings(db, learnerId);

  const goals = await db.query<GoalRow>(
    `select g.id, g.kind, g.title, g.subject_id, s.name as subject_name, g.due_date, g.topics,
            g.status, g.outcome, g.version, g.created_at, g.closed_at
       from buddy_goals g left join subjects s on s.id = g.subject_id
      where g.learner_id = $1
        and (g.status = 'active' or g.closed_at > $2::timestamptz - interval '14 days')
      order by (g.status = 'active') desc, g.due_date nulls last, g.created_at, g.seq
      limit $3`,
    [learnerId, now, LIMITS.goals],
  );

  // What she is working on (issue #160). Joined to its own rows, so a sheet she deleted or
  // a goal she closed does not leave a line that points at nothing.
  const focus = await db.maybeOne<FocusRow>(
    `select f.material_id, m.title as material_title,
            f.subject_id, s.name as subject_name,
            f.goal_id, g.title as goal_title,
            f.vocabulary_only, f.direction, f.said, f.updated_at
       from buddy_focus f
       left join materials m on m.id = f.material_id and m.archived_at is null
       left join subjects s on s.id = f.subject_id
       left join buddy_goals g on g.id = f.goal_id and g.status = 'active'
      where f.learner_id = $1`,
    [learnerId],
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

  const subjects = await db.query<SubjectRow>(
    `select s.id, s.name, s.kind,
            (select count(*) from items i where i.subject_id = s.id and i.archived_at is null
                and i.origin <> 'homework')::int as item_count,
            (select count(*) from materials m where m.subject_id = s.id and m.archived_at is null and m.merged_into is null
                and (m.status <> 'awaiting_upload' or m.send_requested_at is not null))::int as material_count
       from subjects s
      where s.learner_id = $1 and s.archived_at is null
      order by s.created_at, s.seq
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
      where i.learner_id = $1 and i.archived_at is null and i.origin <> 'homework'
      group by i.subject_id, coalesce(i.topic, '')
      order by count(*) desc, i.subject_id, coalesce(i.topic, '')
      limit $2`,
    [learnerId, LIMITS.topics, now],
  );

  const materialRows = await db.query<Omit<MaterialBrief, 'unclear'>>(
    `select m.id, m.title, m.status, m.failure_reason, m.subject_id, m.goal_id, m.created_at,
            m.failed_at, m.photo_count,
            -- Pages not read: while unanswered, and for a day after the reading (the sheet is
            -- still at hand) — the home notice and Buddy's context see the same window.
            case when m.pages_resolved_at is null and m.ready_at > $3::timestamptz - interval '24 hours'
                 then m.page_problems else '[]'::jsonb end as page_problems,
            m.items_incomplete, m.not_practicable,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null
                and i.origin <> 'homework')::int as item_count
       from materials m
      where m.learner_id = $1 and m.archived_at is null
        -- Pages she is still attaching in the chat are not a sheet yet (issue #56).
        and (m.status <> 'awaiting_upload' or m.send_requested_at is not null)
        -- A merged part only while its own missing pages are not answered.
        and (m.merged_into is null
             or (m.pages_resolved_at is null and m.page_problems <> '[]'::jsonb
                 and m.ready_at > $3::timestamptz - interval '24 hours'))
      order by m.created_at desc, m.seq desc
      limit $2`,
    [learnerId, LIMITS.materials, now],
  );
  // Spots one of her sheets could not be read at, and what became of her answer (issue #164
  // point 1). Three states reach Buddy, and no others: `open` while the ask still stands (it
  // expires by itself — nothing nags), `answered` while the question is being written from her
  // reading, and a reading that added nothing after she answered, for a day, because her answer
  // disappearing without a word would be the opposite of rule 5. Attached to the sheet she sees.
  const unclearRows = await db.query<UnclearSpotBrief & { sheet_id: string }>(
    `select s.sheet_id, s.ref, s.material_id, s.page, p.photo_count, s.task, s.about, s.readings,
            s.status, s.answer, s.items_added
       from material_unclear_spots s
       join materials m on m.id = s.sheet_id
       join materials p on p.id = s.material_id
      where s.learner_id = $1 and m.archived_at is null
        and (s.status = 'answered'
             or (s.status = 'open' and s.expires_at > $2)
             or (s.status = 'read' and s.items_added = 0
                 and s.read_at > $2::timestamptz - interval '24 hours'))
      order by s.seq
      limit $3`,
    [learnerId, now, LIMITS.materials * 2],
  );
  const materials: MaterialBrief[] = materialRows.map((m) => ({
    ...m,
    unclear: unclearRows
      .filter((u) => u.sheet_id === m.id)
      .map(({ sheet_id: _sheet, ...spot }) => spot),
  }));

  // The newest sessions, and every one still open however old (the scheduler closes idle
  // ones, practice/lifecycle.ts): an open homework is never out of reach (audit H-7).
  // Secure and shaky topics come from the one summary the result screen uses (feedback #3).
  const sessionRows = await db.query<
    Omit<SessionBrief, 'secure_topics' | 'shaky_topics'> & { topic_rows: SummaryRow[] }
  >(
    `select ps.id, ps.status, ps.goal_id, ps.step_id, ps.started_at, ps.last_activity_at,
            ps.finished_at, case when ps.mode = 'explain' then 'practice' else ps.mode end as mode,
            ps.title,
            count(si.item_id)::int as total,
            count(*) filter (where si.status <> 'open')::int as answered,
            count(*) filter (where si.status = 'correct' and si.first_try_correct)::int as first_try,
            coalesce(json_agg(json_build_object('topic', i.topic, 'status', si.status,
                                                'first_try_correct', si.first_try_correct,
                                                -- Recognition and production are different
                                                -- evidence (issue #163).
                                                'answered_by', si.answered_by,
                                                -- A free text she did not get right names no
                                                -- shaky topic (issue #197).
                                                'kind', i.kind))
                       filter (where si.item_id is not null), '[]'::json) as topic_rows
       from practice_sessions ps
       -- A question she flagged as unfit counts as neither answered nor shaky.
       left join session_items si on si.session_id = ps.id and si.flagged_at is null
       left join items i on i.id = si.item_id
      where ps.learner_id = $1
        and (ps.status = 'active'
             or ps.id in (select id from practice_sessions where learner_id = $1
                           order by started_at desc, seq desc limit $2))
      group by ps.id
      order by ps.started_at desc, ps.seq desc`,
    [learnerId, LIMITS.sessions],
  );
  const sessions: SessionBrief[] = sessionRows.map(({ topic_rows, ...s }) => {
    const summary = summarize(topic_rows);
    return { ...s, secure_topics: summary.secure_topics, shaky_topics: summary.shaky_topics };
  });

  // What he already put in front of her and she has not taken up (issue #184).
  const standing = await loadStandingOffers(db, learnerId, now);

  const outreach = await db.query<OutreachRow>(
    `select id, kind, origin, topic_key, title, body, why, status, send_at, sent_at, opened_at,
            responded_at, response, goal_id, step_id, created_at
       from buddy_outreach
      where learner_id = $1 and created_at > $2::timestamptz - make_interval(days => $3)
      order by created_at desc, seq desc`,
    [learnerId, now, LIMITS.outreachDays],
  );

  const totals = await db.one<{
    goals: number;
    steps: number;
    memories: number;
    items: number;
    materials: number;
  }>(
    `select
       (select count(*) from buddy_goals where learner_id = $1 and status = 'active')::int as goals,
       (select count(*) from buddy_steps where learner_id = $1 and state in ('planned','prepared','in_progress'))::int as steps,
       (select count(*) from buddy_memories where learner_id = $1 and status = 'active'
          and (valid_until is null or valid_until > $2))::int as memories,
       (select count(*) from items where learner_id = $1 and archived_at is null
                                           and origin <> 'homework')::int as items,
       (select count(*) from materials where learner_id = $1 and archived_at is null
                                            and merged_into is null
                                            and (status <> 'awaiting_upload' or send_requested_at is not null))::int as materials`,
    [learnerId, now],
  );

  return {
    settings,
    goals,
    steps,
    memories,
    messages,
    summaries,
    subjects,
    topics,
    materials,
    focus,
    sessions,
    standing,
    outreach,
    totals: {
      activeGoals: totals.goals,
      openSteps: totals.steps,
      memories: totals.memories,
      items: totals.items,
      materials: totals.materials,
    },
  };
}
