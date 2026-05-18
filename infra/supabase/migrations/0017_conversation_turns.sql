-- 0017 — Conversation turns + resumable/pinned sessions.
-- Source: docs/06-ai-pipeline.md §P3, docs/05-mobile.md §session,
--         docs/01-product.md §Studying ("Das Üben ist ein Gespräch").
--
-- Before this migration the only record of a learning interaction was the
-- flat `attempts` grading log (one row = one graded answer, no thread).
-- The tutor was therefore stateless: every LLM call saw a single synthetic
-- user message and none of the prior dialogue. This table makes the session
-- a real, ordered, replayable conversation so the tutor always receives the
-- full transcript on every turn.
--
-- A turn is one message in the thread:
--   role   — who spoke: the learner, the tutor, or the system (item prompt).
--   kind   — what the message is: the item question, a learner answer, a
--            tutor hint, tutor feedback, the answer reveal, or a free note.
--   content— the text shown / spoken.
--   verdict— set on tutor 'feedback' turns so the result summary and FSRS
--            can be reconstructed from the thread without a join to attempts.
--
-- sessions gains the columns needed for deterministic resume and the two
-- sustained-session modes (keep-going + pin-to-topic):
--   picked_item_ids — the exact ordered item set chosen at start, so a
--                      resume returns the SAME questions instead of letting
--                      FSRS re-pick a different set under the learner.
--   pinned_topic    — when set, the session keeps drilling this topic.
--   last_turn_at    — drives the "möchtest du fortsetzen?" resume nudge.

create table conversation_turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  learner_id      uuid not null references learners(id) on delete cascade,
  item_id         uuid references items(id) on delete set null,
  turn_index      int  not null,
  role            text not null check (role in ('learner', 'tutor', 'system')),
  kind            text not null check (kind in ('question', 'answer', 'hint', 'feedback', 'reveal', 'note')),
  content         text not null,
  verdict         text check (verdict in ('correct', 'partially_correct', 'incorrect', 'skipped')),
  mode            text check (mode in ('voice', 'text', 'multiple_choice')),
  -- Client-generated id of the learner message. Lets a retried/duplicated
  -- send (flaky network, offline outbox) replay the original tutor reply
  -- instead of re-charging credits and re-calling the model.
  client_turn_id  uuid,
  created_at      timestamptz not null default now()
);

-- One row per (session, turn_index); the index is also the natural order
-- for replaying the thread into the LLM `contents` array.
create unique index conversation_turns_session_turn_idx
  on conversation_turns(session_id, turn_index);
-- Idempotency: a learner turn's client id is unique within a session.
create unique index conversation_turns_client_idx
  on conversation_turns(session_id, client_turn_id)
  where client_turn_id is not null and role = 'learner';
create index conversation_turns_session_created_idx
  on conversation_turns(session_id, created_at);

alter table conversation_turns enable row level security;
create policy conversation_turn_account_rw on conversation_turns
  for all using (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

-- Deterministic resume + sustained-session state on sessions.
alter table sessions
  add column if not exists picked_item_ids jsonb not null default '[]'::jsonb;
alter table sessions
  add column if not exists pinned_topic text;
alter table sessions
  add column if not exists last_turn_at timestamptz;
