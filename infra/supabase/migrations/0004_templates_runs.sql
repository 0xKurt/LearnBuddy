-- 0004 — Problem templates and practice runs.
-- Source: docs/03-data-model.md §problem-templates-and-practice-runs.

create table problem_templates (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete cascade,
  learner_id uuid not null references learners(id) on delete cascade,
  source_item_id uuid references items(id) on delete set null,
  subject_kind text not null,
  topic text not null,
  template_text text not null,
  params jsonb not null,
  constraints jsonb not null default '[]',
  text_substitutions jsonb not null default '[]',
  solution_expression text not null,
  answer_kind text not null check (answer_kind in ('numeric','formula','short')),
  units text,
  stimulus_template jsonb,
  difficulty smallint not null default 2 check (difficulty between 1 and 5),
  difficulty_adjustment smallint not null default 0 check (difficulty_adjustment between -2 and 2),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index problem_templates_learner_idx on problem_templates(learner_id) where archived_at is null;
create index problem_templates_material_idx on problem_templates(material_id);

create trigger problem_templates_updated_at
  before update on problem_templates
  for each row execute function lb_set_updated_at();

alter table problem_templates enable row level security;
create policy template_account_rw on problem_templates
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

-- Items.problem_template_id was created NULL in 0003; close the FK now that
-- problem_templates exists.
alter table items
  add constraint items_problem_template_fk
  foreign key (problem_template_id) references problem_templates(id) on delete set null;

create table practice_runs (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  template_id uuid not null references problem_templates(id) on delete cascade,
  problems_generated int not null,
  problems_correct int not null default 0,
  avg_time_ms int,
  difficulty_adjustment smallint not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index practice_runs_learner_template_idx on practice_runs(learner_id, template_id, started_at desc);

alter table practice_runs enable row level security;
create policy practice_run_account_rw on practice_runs
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
