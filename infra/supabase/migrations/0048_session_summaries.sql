-- What was talked about on the days before (issue #22). Buddy's context carries the last
-- 24 messages and the newest sessions; three weeks later that is nothing. A conversation
-- that has come to an end (nothing said for hours) gets two to four sentences written by
-- the model, and the newest of those travel in the context — cheap tokens instead of an
-- ever longer message list.
--
-- One row per conversation session: from the first message after a long pause to the last
-- one before the next. `until_message_id` is what was summarised, so a session that goes
-- on later is summarised again from there.

create table buddy_session_summaries (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  -- The learner's local day the conversation started on (her calendar, not UTC).
  day date not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Two to four sentences in her language, written by the model.
  summary text not null check (length(summary) between 1 and 800),
  -- What it was about, for Buddy to connect to ("Brüche", "Referat Rom").
  topics jsonb not null default '[]'::jsonb,
  /** The last message this summary covers: a session that continues starts after it. */
  until_message_id uuid references buddy_messages(id) on delete set null,
  created_at timestamptz not null default now()
);

create index buddy_session_summaries_learner_idx
  on buddy_session_summaries (learner_id, ended_at desc);
-- Every foreign key carries its index, so deleting an account never scans the table
-- (src/__tests__/scale.int.test.ts).
create index buddy_session_summaries_until_idx
  on buddy_session_summaries (until_message_id);

alter table buddy_session_summaries enable row level security;

-- The summary job and the model call it makes.
alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'extract_material','buddy_check','buddy_turn','purge_photos','delete_account','purge_content',
  'summarise_session'
));

alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain','summary'));
