-- Questions are prepared ahead; hints start only after the app opens the run (#868).
alter table practice_sessions
  add column opened_at timestamptz,
  add column hints_on_open boolean not null default false;
alter table session_items add column hints_requested_at timestamptz;

-- Content-free counters, one pair per offer so retries cannot inflate the tap rate.
-- sum(opened) / sum(offered), grouped by kind. Retained for 180 days like llm_calls.
create table offer_counters (
  action_id uuid primary key references buddy_actions(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  -- Validated from the contract in code; new kinds do not need another migration.
  kind text not null,
  offered smallint not null default 1 check (offered = 1),
  opened smallint not null default 0 check (opened in (0, 1)),
  created_at timestamptz not null
);
create index offer_counters_learner_idx on offer_counters(learner_id);
create index offer_counters_created_idx on offer_counters(created_at);
alter table offer_counters enable row level security;
-- No policies: only the API accesses these counters, like llm_calls.
