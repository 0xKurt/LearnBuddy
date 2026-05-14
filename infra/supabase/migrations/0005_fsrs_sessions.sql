-- 0005 — FSRS state, sessions, attempts.
-- Source: docs/03-data-model.md §fsrs-state-sessions-attempts.

create table item_states (
  item_id uuid primary key references items(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state smallint not null default 0,        -- 0=New 1=Learning 2=Review 3=Relearning
  last_review timestamptz,
  due timestamptz not null default now(),
  mastery_score smallint not null default 0,
  updated_at timestamptz not null default now()
);
create index item_states_learner_due_idx on item_states(learner_id, due);

create trigger item_states_updated_at
  before update on item_states
  for each row execute function lb_set_updated_at();

alter table item_states enable row level security;
create policy item_state_account_rw on item_states
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

create table sessions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  subject_id uuid references subjects(id) on delete set null,
  test_mode boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  attempts_count int not null default 0,
  correct_count int not null default 0,
  created_at timestamptz not null default now()
);
create index sessions_learner_idx on sessions(learner_id, started_at desc);

alter table sessions enable row level security;
create policy session_account_rw on sessions
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

create table attempts (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  session_id uuid references sessions(id) on delete set null,
  mode text not null check (mode in ('voice','text','multiple_choice')),
  kid_answer text,
  verdict text not null check (verdict in ('correct','partially_correct','incorrect','skipped')),
  evaluated_by text not null check (evaluated_by in ('local','llm')),
  evaluation_model text,
  evaluation_prompt_version text,
  feedback text,
  hints_used smallint not null default 0,
  duration_ms int,
  test_mode boolean not null default false,
  created_at timestamptz not null default now()
);
create index attempts_learner_recent_idx on attempts(learner_id, created_at desc);
create index attempts_item_idx on attempts(item_id);

alter table attempts enable row level security;
create policy attempt_account_rw on attempts
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
