-- 0011 — pg_cron schedules for Edge Functions + housekeeping.
-- Source: docs/09-privacy.md §photo-retention, docs/08-cost-and-credits.md §reconcile.
--
-- IMPORTANT — before applying this migration set two GUCs in your Supabase
-- project (Dashboard → Database → Settings → Configuration parameters):
--
--   app.supabase_url          = 'https://<ref>.supabase.co'
--   app.supabase_service_role = '<service-role-jwt>'
--
-- These values are read by the pg_cron job bodies to authenticate the
-- Edge Function HTTP invocations. They are NOT stored in this migration.
--
-- Apply this migration AFTER the Edge Functions have been deployed, otherwise
-- the HTTP calls will 404.

create extension if not exists pg_cron schema extensions;

-- Helper: invoke a Supabase Edge Function from pg_cron.
-- $1 = function slug (e.g. 'photo-wipe')
create or replace function lb_invoke_edge_function(func_slug text)
returns void language plpgsql security definer as $$
declare
  _url  text := current_setting('app.supabase_url', true) || '/functions/v1/' || func_slug;
  _key  text := current_setting('app.supabase_service_role', true);
begin
  perform net.http_post(
    url     := _url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || _key
               ),
    body    := '{}'::jsonb
  );
end;
$$;

-- ── Photo wipe (DSGVO — 7-day raw-photo deletion) ─────────────────────────
-- Daily at 03:00 UTC. Must run after midnight to catch yesterday's T+7d rows.
select cron.schedule(
  'lb-photo-wipe',
  '0 3 * * *',
  $$ select lb_invoke_edge_function('photo-wipe'); $$
);

-- ── DSGVO export worker ───────────────────────────────────────────────────
-- Hourly. Pending export requests complete within 1 h of submission.
select cron.schedule(
  'lb-dsgvo-export',
  '5 * * * *',
  $$ select lb_invoke_edge_function('dsgvo-export-worker'); $$
);

-- ── DSGVO delete executor ─────────────────────────────────────────────────
-- Daily at 04:00 UTC. Picks deletion requests whose 7-day hold has elapsed.
select cron.schedule(
  'lb-dsgvo-delete',
  '0 4 * * *',
  $$ select lb_invoke_edge_function('dsgvo-delete-executor'); $$
);

-- ── RevenueCat reconciliation ─────────────────────────────────────────────
-- Daily at 06:00 UTC. Catches missed webhooks and corrects subscription state.
select cron.schedule(
  'lb-revenuecat-reconcile',
  '0 6 * * *',
  $$ select lb_invoke_edge_function('reconcile-revenuecat'); $$
);

-- ── Idempotency key cleanup ──────────────────────────────────────────────
-- Daily at 02:00 UTC. Deletes rows older than 25 h (1-hour buffer beyond the
-- 24-hour replay window) to keep the table from growing unbounded.
select cron.schedule(
  'lb-idempotency-cleanup',
  '0 2 * * *',
  $$ delete from idempotency_keys where stored_at < now() - interval '25 hours'; $$
);

-- ── Rate-limit counter cleanup ───────────────────────────────────────────
-- Daily at 02:10 UTC. Removes windows that expired over a day ago.
select cron.schedule(
  'lb-rate-limit-cleanup',
  '10 2 * * *',
  $$ delete from rate_limit_counters where reset_at < now() - interval '1 day'; $$
);
