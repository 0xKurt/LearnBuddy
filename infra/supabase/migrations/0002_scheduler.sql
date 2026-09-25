-- 0002 — Scheduler trigger for background work.
-- Source: docs/architecture.md §Background work.
--
-- Separate from the baseline so the schema itself applies on any Postgres
-- (tests run it on vanilla Postgres 16 without these extensions).
--
-- Operator setup (once per Supabase project, Dashboard → Vault):
--   lb_api_url      = https://<api-host>/v1
--   lb_tick_secret  = same value as the API's TICK_SECRET
-- Alternative: any external cron may POST {api}/internal/tick with the header
-- x-tick-secret; the endpoint is idempotent and safe to call concurrently.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule('lb-tick', '* * * * *', $$select lb_invoke_tick();$$);
