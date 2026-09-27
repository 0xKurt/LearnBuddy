-- One lockout and rate-limit primitive for the whole API (docs/architecture.md §Limits).
--
-- Every budget an account has — wrong PINs, PIN recovery, answers, messages —
-- is one row here, changed by a single atomic `insert … on conflict do update
-- … returning` in apps/api/src/lib/limits.ts. Timestamps come from the app
-- clock (rule 7), never from now(). The PIN counter used to live on accounts
-- (pin_failed_count / pin_locked_until) as a read-modify-write that a burst of
-- parallel requests could undercount; those columns go away with this table.
create table attempt_counters (
  scope text not null check (length(scope) between 1 and 40),
  account_id uuid not null references accounts(id) on delete cascade,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  -- Set when a lockout policy tripped; escalates with lock_level.
  locked_until timestamptz,
  lock_level smallint not null default 0 check (lock_level >= 0),
  -- Whether the last consume() was refused (read back by the same statement).
  refused boolean not null default false,
  updated_at timestamptz not null,
  primary key (scope, account_id)
);
create index attempt_counters_account on attempt_counters (account_id);

alter table attempt_counters enable row level security;
-- No policies: only the API (service role / owner) touches it.

alter table accounts drop column pin_failed_count;
alter table accounts drop column pin_locked_until;
