-- 0013 — Per-job advisory locks for Edge Function concurrency.
--
-- The scheduled Edge Functions (photo-wipe, dsgvo-export-worker,
-- dsgvo-delete-executor, reconcile-revenuecat) can fire twice if pg_cron
-- + manual reconcile invocations overlap. Most are benign but
-- dsgvo-delete-executor calling auth.admin.deleteUser twice would be
-- noisy at best and concerning at worst. This table holds a 5-minute
-- lease keyed on job name; the function acquires before working and
-- releases when done (or expires automatically).

create table cron_locks (
  name text primary key,
  locked_until timestamptz,
  holder text,
  updated_at timestamptz not null default now()
);

alter table cron_locks enable row level security;
-- service role only.

-- Acquire (or extend) a 5-minute lease. Returns the row if acquired,
-- nothing if another holder is still in the lease window. The single
-- UPDATE … WHERE … RETURNING form is race-free.
create or replace function lb_acquire_cron_lock(p_name text, p_holder text)
returns table (name text, locked_until timestamptz)
language plpgsql
security definer
as $$
begin
  -- Ensure the row exists.
  insert into cron_locks (name) values (p_name) on conflict (name) do nothing;
  return query
    update cron_locks
       set locked_until = now() + interval '5 minutes',
           holder = p_holder,
           updated_at = now()
     where cron_locks.name = p_name
       and (cron_locks.locked_until is null or cron_locks.locked_until < now())
    returning cron_locks.name, cron_locks.locked_until;
end;
$$;

create or replace function lb_release_cron_lock(p_name text)
returns void
language sql
security definer
as $$
  update cron_locks
     set locked_until = now(),
         updated_at = now()
   where cron_locks.name = p_name;
$$;
