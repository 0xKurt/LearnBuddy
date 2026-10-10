// The learning domain's part of what Buddy knows about one learner (issue #107, cut 5): her
// subjects and how each topic went, her sheets, what she is working on, her practices, the offers
// still standing and the questions she kept for later. Read with the core's connection, so the
// home screen's snapshot covers it too (buddy/home.ts); scoped by learner_id like every query of
// the state, and nothing here trusts client input.
//
// The fields are added to Buddy's state by augmenting `DomainState` (buddy/state.ts): the core
// carries them without naming them; only what the domain renders reads them.

import type {
  ActionSummary,
  DifficultyWish,
  MaterialFailure,
  MaterialSource,
  NotPracticable,
  PageProblem,
  TestMinutes,
  VocabDirection,
} from '@learnbuddy/shared-types/contracts';

import type { Db } from '../../lib/db.js';
import type { RecallableMessage } from '../buddy/recall.js';
import { summarize, type SummaryRow } from '../practice/summary.js';

export type SubjectRow = {
  id: string;
  name: string;
  kind: string;
  item_count: number;
  material_count: number;
};

type TopicProgress = {
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
type FocusRow = {
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
type UnclearSpotBrief = {
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
  failure_reason: MaterialFailure | null;
  /** What kind of page it is (issue #259): a corrected test and a notebook entry are said. */
  source: MaterialSource;
  /** When it was read; a notebook entry is "the lesson of that day". */
  ready_at: Date | null;
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

/** What the act tools need of a sheet they are pointed at (issue #153). */
export type MaterialTarget = Pick<MaterialBrief, 'id' | 'title' | 'status'>;

type SessionBrief = {
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
type StandingOffer = {
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

/**
 * „Merk ich mir für nachher" (issue #391): a question she asked the tutor during a practice that
 * is over now, which she tapped to keep. Her words only — never the tutor's reply, which may
 * hold a hint — shaped as a message so a model reads it through `recall.ts` like any other.
 */
type LaterNote = RecallableMessage & {
  /** The practice it came from, as she knows it (topic, sheet, goal), if it has a title. */
  session_title: string | null;
  /** When that practice ended. */
  ended_at: Date;
};

declare module '../buddy/state.js' {
  interface DomainState {
    subjects: SubjectRow[];
    topics: TopicProgress[];
    materials: MaterialBrief[];
    /** What she is working on, or null while nothing has been agreed (issue #160). */
    focus: FocusRow | null;
    sessions: SessionBrief[];
    /** Offers of his she has not taken up yet, oldest first (issue #184). */
    standing: StandingOffer[];
    /** Questions she kept for after a practice that has ended, oldest first (issue #391). */
    later: LaterNote[];
  }
  interface DomainTotals {
    /** Her practice questions (homework tasks are not practice questions, p2-HW-06). */
    items: number;
    /** All her sheets, not only the newest ones in `materials` (issue #49). */
    materials: number;
  }
}

// Questions here are what practice can use: homework tasks belong to their help session
// and are never counted as practice questions (p2-HW-06).
const LIMITS = {
  subjects: 20,
  topics: 40,
  materials: 10,
  sessions: 5,
  /** Offers still standing; more than a handful is not a list the model needs to read. */
  standing: 5,
  /** Questions kept for after practice (issue #391): a few, never a backlog to work through. */
  later: 3,
} as const;

/**
 * How long an offer she has not taken up still counts as standing. Its button never stops
 * working, but a day is as far back as "right there in front of her" reaches honestly.
 */
const STANDING_WINDOW_MS = 24 * 3_600_000;

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

/**
 * Questions she kept for after practice (issue #391), from practices that are over — finished or
 * closed for idleness — within the same day-long window as a standing offer: "Du wolltest vorhin
 * wissen, …" reaches back that far honestly, and not further. While the practice still runs the
 * note waits: no jumping into the chat in the middle of a task (report §4).
 */
async function loadLaterNotes(db: Db, learnerId: string, now: Date): Promise<LaterNote[]> {
  const rows = await db.query<{ text: string; session_title: string | null; ended_at: Date }>(
    `select q.text, ps.title as session_title,
            coalesce(ps.finished_at, ps.last_activity_at) as ended_at
       from practice_turns t
       join practice_turns q on q.session_id = t.session_id and q.seq = t.seq - 1
                            and q.role = 'learner'
       join practice_sessions ps on ps.id = t.session_id
      where t.learner_id = $1 and t.later = 'kept' and ps.status <> 'active'
        and coalesce(ps.finished_at, ps.last_activity_at) > $2
      order by t.later_at desc, t.seq desc
      limit $3`,
    [learnerId, new Date(now.getTime() - STANDING_WINDOW_MS), LIMITS.later],
  );
  // A kept question was never a disclosure or a held-back message: those get the fixed help
  // answer and no chip (practice/answer.ts). So no practice turn carries a recall block today.
  return rows.reverse().map((r) => ({ role: 'learner' as const, recall_block: null, ...r }));
}

/** Her sheets, with the spots each could not be read at (issue #164 point 1). */
async function loadMaterials(db: Db, learnerId: string, now: Date): Promise<MaterialBrief[]> {
  const materialRows = await db.query<Omit<MaterialBrief, 'unclear'>>(
    `select m.id, m.title, m.status, m.failure_reason, m.subject_id, m.goal_id, m.created_at,
            m.failed_at, m.photo_count, m.source, m.ready_at,
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
  return materialRows.map((m) => ({
    ...m,
    unclear: unclearRows
      .filter((u) => u.sheet_id === m.id)
      .map(({ sheet_id: _sheet, ...spot }) => spot),
  }));
}

/**
 * The newest sessions, and every one still open however old (the scheduler closes idle ones,
 * practice/lifecycle.ts): an open homework is never out of reach (audit H-7). Secure and shaky
 * topics come from the one summary the result screen uses (feedback #3).
 */
async function loadSessions(db: Db, learnerId: string): Promise<SessionBrief[]> {
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
  return sessionRows.map(({ topic_rows, ...s }) => {
    const summary = summarize(topic_rows);
    return { ...s, secure_topics: summary.secure_topics, shaky_topics: summary.shaky_topics };
  });
}

/** Everything of the learning domain in Buddy's state (its context provider's `load`). */
export async function loadLearningState(db: Db, learnerId: string, now: Date) {
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

  const materials = await loadMaterials(db, learnerId, now);
  const sessions = await loadSessions(db, learnerId);
  // What he already put in front of her and she has not taken up (issue #184).
  const standing = await loadStandingOffers(db, learnerId, now);
  // What she kept for after a practice that is over (issue #391).
  const later = await loadLaterNotes(db, learnerId, now);

  const totals = await db.one<{ items: number; materials: number }>(
    `select
       (select count(*) from items where learner_id = $1 and archived_at is null
                                           and origin <> 'homework')::int as items,
       (select count(*) from materials where learner_id = $1 and archived_at is null
                                            and merged_into is null
                                            and (status <> 'awaiting_upload' or send_requested_at is not null))::int as materials`,
    [learnerId],
  );

  return { subjects, topics, materials, focus, sessions, standing, later, totals };
}

/** The names of her subjects by id, archived ones too (a goal keeps its subject's name). */
export async function subjectNames(
  db: Db,
  learnerId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query<{ id: string; name: string }>(
    `select id, name from subjects where learner_id = $1 and id = any($2::uuid[])`,
    [learnerId, [...new Set(ids)]],
  );
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Find the learner's subject by name (case-insensitive) or unique kind; else create it. */
export async function findOrCreateSubject(
  db: Db,
  learnerId: string,
  name: string,
  kind: string,
): Promise<{ id: string; name: string; created: boolean }> {
  const byName = await db.maybeOne<{ id: string; name: string }>(
    `select id, name from subjects
      where learner_id = $1 and archived_at is null and lower(name) = lower($2)`,
    [learnerId, name],
  );
  if (byName) return { ...byName, created: false };
  if (kind !== 'other') {
    const byKind = await db.query<{ id: string; name: string }>(
      `select id, name from subjects where learner_id = $1 and archived_at is null and kind = $2`,
      [learnerId, kind],
    );
    if (byKind.length === 1) return { ...byKind[0]!, created: false };
  }
  const created = await db.one<{ id: string; name: string }>(
    `insert into subjects (learner_id, name, kind) values ($1, $2, $3)
     on conflict (learner_id, lower(name)) where archived_at is null
       do update set name = subjects.name
     returning id, name`,
    [learnerId, name.slice(0, 60), kind],
  );
  return { ...created, created: true };
}

/** A sheet that was just read, with its questions — for the fixed message when no model answers. */
export async function readySheet(
  db: Db,
  learnerId: string,
  id: string,
): Promise<{
  title: string | null;
  goalId: string | null;
  subjectId: string | null;
  questions: number;
} | null> {
  const m = await db.maybeOne<{
    title: string | null;
    goal_id: string | null;
    subject_id: string | null;
    n: number;
  }>(
    `select m.title, m.goal_id, m.subject_id,
            (select count(*) from items i where i.material_id = m.id and i.archived_at is null)::int as n
       from materials m where m.id = $1 and m.learner_id = $2 and m.status = 'ready'
        and m.archived_at is null`,
    [id, learnerId],
  );
  return m ? { title: m.title, goalId: m.goal_id, subjectId: m.subject_id, questions: m.n } : null;
}
