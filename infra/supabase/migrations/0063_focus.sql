-- What she is working on right now, as state rather than as something re-read out of the
-- chat every turn (issue #160).
--
-- Until now the answer to "which sheet, which direction, how much" lived only in the
-- conversation, and Buddy rebuilt it from old messages on every turn. That is where it went
-- wrong: she said "frag mich die Vokabeln ab" and the scope arrived at the pool as the
-- SUBJECT Französisch, with both sheets in it (#144). After a pause, an app restart, or once
-- the sentence falls out of the dialogue window, there was nothing left at all.
--
-- One row per learner, so there is one answer and not a history to interpret. It is changed
-- when she changes it — never guessed at, and never written by the model: the sheet comes
-- from her own aliases (hard rule 2), and `version` carries it under the same fence as
-- everything else a decision touches.
create table buddy_focus (
  learner_id uuid primary key references learners(id) on delete cascade,
  -- The one sheet she named, when she named one.
  material_id uuid references materials(id) on delete set null,
  subject_id uuid references subjects(id) on delete set null,
  goal_id uuid references buddy_goals(id) on delete set null,
  -- Vocabulary and nothing else, and which way round she is practising it.
  vocabulary_only boolean not null default false,
  direction text check (direction in ('recognise', 'produce')),
  -- Her own words for it, so the line above the conversation reads like her, not like a
  -- database row. Never a title the model invented for it.
  said text check (length(said) between 1 and 200),
  version int not null default 1,
  updated_at timestamptz not null
);

comment on table buddy_focus is
  'What the learner is working on, held across chat, reading, practice, a pause and coming back. One row per learner; changed when she changes it, never guessed. Issue #160.';

alter table buddy_focus enable row level security;

create index buddy_focus_material_idx on buddy_focus (material_id) where material_id is not null;
create index buddy_focus_subject_idx on buddy_focus (subject_id) where subject_id is not null;
create index buddy_focus_goal_idx on buddy_focus (goal_id) where goal_id is not null;
