-- 0001 — Identity and ownership.
-- Source: docs/03-data-model.md §identity-and-ownership.

create extension if not exists pgcrypto;

-- ─────────────── updated_at trigger ───────────────
create or replace function lb_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────── accounts ───────────────
create table accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  locale text not null default 'de',
  country_code text not null default 'DE',
  dsgvo_consent_version text,
  dsgvo_consent_at timestamptz,
  scheduled_deletion_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index accounts_owner_idx on accounts(owner_user_id);

create trigger accounts_updated_at
  before update on accounts
  for each row execute function lb_set_updated_at();

alter table accounts enable row level security;
create policy account_owner_rw on accounts
  for all using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ─────────────── learners (one active profile per account) ───────────────
create table learners (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  display_name text not null,
  birth_year smallint check (birth_year between 2005 and 2025),
  grade_level smallint not null check (grade_level between 1 and 13),
  ui_locale text not null default 'de',
  preferred_answer_mode text not null default 'voice'
    check (preferred_answer_mode in ('voice','text','multiple_choice')),
  avatar_id smallint not null default 1,
  notifications_practice_nudge_enabled boolean not null default false,
  notifications_practice_nudge_time time not null default '16:30',
  notifications_test_heads_up_enabled boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A soft-archived profile must not block creation of its replacement, so
-- uniqueness is scoped to active rows only.
create unique index learners_account_idx on learners(account_id) where archived_at is null;

create trigger learners_updated_at
  before update on learners
  for each row execute function lb_set_updated_at();

alter table learners enable row level security;
create policy learner_account_rw on learners
  for all using (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  )
  with check (
    account_id in (select id from accounts where owner_user_id = auth.uid())
  );
