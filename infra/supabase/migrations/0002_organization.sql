-- 0002 — Subjects and folders.
-- Source: docs/03-data-model.md §organization.

create table subjects (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id) on delete cascade,
  name text not null,
  subject_kind text not null default 'general'
    check (subject_kind in (
      'math','physics','chemistry','biology','geography',
      'history','language_native','language_foreign',
      'religion_ethics','art_music','general','other'
    )),
  color_hex text not null default '#6B8AFD',
  icon_id text,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subjects_learner_idx on subjects(learner_id) where archived_at is null;

create trigger subjects_updated_at
  before update on subjects
  for each row execute function lb_set_updated_at();

alter table subjects enable row level security;
create policy subject_account_rw on subjects
  for all using (
    learner_id in (
      select k.id from learners k
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    learner_id in (
      select k.id from learners k
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );

create table folders (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  scheduled_for date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index folders_subject_idx on folders(subject_id) where archived_at is null;
create index folders_upcoming_idx on folders(scheduled_for)
  where archived_at is null and scheduled_for is not null;

create trigger folders_updated_at
  before update on folders
  for each row execute function lb_set_updated_at();

alter table folders enable row level security;
create policy folder_account_rw on folders
  for all using (
    subject_id in (
      select s.id from subjects s
      join learners k on k.id = s.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  )
  with check (
    subject_id in (
      select s.id from subjects s
      join learners k on k.id = s.learner_id
      join accounts f on f.id = k.account_id
      where f.owner_user_id = auth.uid()
    )
  );
