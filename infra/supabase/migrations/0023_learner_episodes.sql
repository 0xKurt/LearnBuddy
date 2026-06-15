-- 0023 — Cross-session memory: learner episodes + recurring misconceptions.
-- Source: docs/LEARNER-EXPERIENCE-PLAN.md Phase C.
--
-- The relationship-feeling of being remembered is the single most missing
-- feature today. The current tutor is amnesiac across sessions — every
-- session is a stranger. Real teachers say "letztes Mal haben wir uns
-- die Brüche angeguckt — wo waren wir stehen geblieben?"
--
-- TWO tables:
--
--   learner_episodes
--     A short structured summary of a single session, generated AFTER the
--     session ends by lib/reflective/session-reflect.ts (one LLM call per
--     session). Acts as the substrate the NEXT session's opener template
--     reads from + the "from last time" block in the tutor prompt.
--     Keep the last 10 per learner; older are summarized into a single
--     long-term row (later slice).
--
--   recurring_misconceptions
--     Per-learner record of conceptual mistakes that have shown up more
--     than once. The reflective layer detects + tags these. The tutor's
--     system prompt (next session) includes the top-3 active
--     misconceptions to "listen for". When detected mid-conversation,
--     the misconception_confrontation strategy move fires.
--
-- L1: both tables are diagnostic data the SYSTEM uses to be smarter.
-- They never surface back to the learner as analysis. The only visible
-- output is the next session's WARM opener line ("letztes Mal haben wir
-- … sollen wir da weitermachen?") and better in-conversation moves.

create table learner_episodes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  ended_at timestamptz not null,
  duration_minutes int not null default 0,
  -- One-sentence narrative arc — "the story of this session". Used by
  -- the next-session opener template + the from-last-time prompt block.
  one_sentence_arc text not null,
  -- ARRAY of topic strings touched in this session.
  concepts_touched jsonb not null default '[]'::jsonb,
  -- Notable wins (e.g. "self-corrected fraction addition on third try").
  high_points jsonb not null default '[]'::jsonb,
  -- Notable stalls (e.g. "3 give-ups on chain rule").
  low_points jsonb not null default '[]'::jsonb,
  -- The reflective layer's best-guess misconception tags it observed
  -- in THIS session. These feed recurring_misconceptions via the
  -- next slice's resolution mechanic.
  hypothesized_misconceptions jsonb not null default '[]'::jsonb,
  -- Open threads to follow up on next session.
  open_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index learner_episodes_learner_idx
  on learner_episodes (learner_id, ended_at desc);

alter table learner_episodes enable row level security;
-- Service-role only — never surfaced to the learner's RLS context.

create table recurring_misconceptions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- A stable tag, e.g. 'fraction_addition.common_denominator' or
  -- 'integration_as_summation'. Open-vocabulary at first; a monthly
  -- clustering pass normalizes the long tail.
  concept_tag text not null,
  -- One-sentence human description of the misconception.
  description text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1,
  -- Set when the tutor actually used a misconception_confrontation move.
  last_addressed_at timestamptz,
  -- Set when the learner correctly handled this concept without scaffold
  -- in a later session. Doesn't get reset; a re-occurrence creates a
  -- new row OR increments seen_count on the existing one.
  resolved_at timestamptz
);

create unique index recurring_misconceptions_unique_idx
  on recurring_misconceptions (learner_id, concept_tag);

create index recurring_misconceptions_learner_active_idx
  on recurring_misconceptions (learner_id, last_seen_at desc)
  where resolved_at is null;

alter table recurring_misconceptions enable row level security;
