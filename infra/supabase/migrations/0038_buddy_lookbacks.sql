-- Visible progress without pressure (gaps.md #7; docs/architecture.md §Proactivity,
-- "Looking back"): Buddy sometimes names in the chat what now sits that was shaky
-- before. Code decides when (modules/buddy/lookback.ts); each look-back said is kept
-- here so the same topic is not celebrated again and look-backs stay rare.
-- said_at / created_at come from the app clock (CLAUDE.md rule 7).

create table buddy_lookbacks (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  -- The topic as compared (lower-case, trimmed) and as shown.
  topic_key text not null check (length(topic_key) between 1 and 80),
  topic text not null check (length(topic) between 1 and 80),
  -- When it was last shaky (the "then" of the look-back).
  shaky_at timestamptz not null,
  message_id uuid references buddy_messages(id) on delete set null,
  decision_id uuid references buddy_decisions(id) on delete set null,
  said_at timestamptz not null,
  created_at timestamptz not null
);
create index buddy_lookbacks_learner_idx on buddy_lookbacks(learner_id, said_at desc);
create index buddy_lookbacks_message_idx on buddy_lookbacks(message_id);
create index buddy_lookbacks_decision_idx on buddy_lookbacks(decision_id);
create index buddy_lookbacks_subject_idx on buddy_lookbacks(subject_id);
alter table buddy_lookbacks enable row level security;
