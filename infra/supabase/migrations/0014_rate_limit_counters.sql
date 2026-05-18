-- Doc 04 §rate-limits: persistent sliding-window counters.
-- Replaces the in-memory Map in apps/api/src/middleware/rate-limit.ts which
-- reset on every Vercel cold start, making per_day limits ineffective.

create table if not exists rate_limit_counters (
  id          text        primary key,          -- "key:account_id:learner_id"
  count       integer     not null default 0,
  reset_at    timestamptz not null,
  updated_at  timestamptz not null default now()
);

comment on table rate_limit_counters is
  'Sliding-window rate-limit counters. reset_at marks when the window expires.';

-- Only service-role key (used by the API) touches this table.
alter table rate_limit_counters enable row level security;
create policy "deny direct access" on rate_limit_counters for all using (false);

-- Clean up expired rows daily to keep the table small.
select cron.schedule(
  'rate-limit-sweep',
  '0 3 * * *',
  $$delete from rate_limit_counters where reset_at < now() - interval '1 day'$$
);
