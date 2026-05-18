-- 0015 — Fix learner constraints + ensure idempotency_keys exists.
--
-- birth_year: original constraint (2005–2025) is too narrow — adult account
-- holders born before 2005 fail the check and get a 500. Widened to 1920–2030.
--
-- grade_level: was NOT NULL which blocks adult learners who don't have a grade.
-- Made nullable; existing rows keep their value, new rows default to NULL.
--
-- idempotency_keys: created idempotently — no-op if migration 0010 already ran.

-- Fix birth_year check constraint on learners
alter table learners
  drop constraint if exists learners_birth_year_check;

alter table learners
  add constraint learners_birth_year_check
  check (birth_year between 1920 and 2030);

-- Make grade_level nullable
alter table learners
  alter column grade_level drop not null;

-- Idempotency keys table — safe to run even if 0010 already applied it
create table if not exists idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  route text not null,
  key text not null,
  status_code int not null,
  response_body text not null,
  response_headers jsonb not null default '{}'::jsonb,
  stored_at timestamptz not null default now()
);

create unique index if not exists idempotency_keys_lookup_idx
  on idempotency_keys(coalesce(account_id::text, 'anon'), route, key);

create index if not exists idempotency_keys_stored_at_idx
  on idempotency_keys(stored_at);

alter table idempotency_keys enable row level security;

create or replace function lb_cleanup_idempotency_keys()
returns void
language sql
security definer
as $$
  delete from idempotency_keys where stored_at < now() - interval '48 hours';
$$;
