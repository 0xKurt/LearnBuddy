-- 0020 — Stale extraction sweep + worker schedule.
-- Source: docs/adr/0003-durable-extraction-pipeline.md,
--         docs/08-cost-and-credits.md §refund-on-failure.
--
-- Safety net for the durable pipeline (0019): if a job never reaches a
-- terminal state (worker crash, function budget, lost connection), this
-- marks it failed, marks the material failed, and REFUNDS the pre-debit so
-- credits never leak on a dropped connection — the original bug. Idempotent.
--
-- Requires the same app.supabase_url / app.supabase_service_role GUCs as
-- migration 0011, plus app.api_url + app.extraction_worker_secret for the
-- worker invocation. Apply AFTER the extraction-worker edge function is
-- deployed.

create or replace function lb_sweep_stale_extractions()
returns void language plpgsql security definer as $$
declare
  _ttl interval := interval '15 minutes';
  j record;
begin
  for j in
    select * from extraction_jobs
    where status in ('queued', 'running')
      and created_at < now() - _ttl
    for update skip locked
  loop
    update extraction_jobs
      set status = 'failed',
          last_error = 'stale_sweep',
          finished_at = now(),
          updated_at = now()
      where id = j.id;

    update materials
      set extraction_status = 'failed',
          extraction_error = 'stale_sweep'
      where id = j.material_id
        and extraction_status <> 'ready';

    -- Refund the pre-debit (Doc 08 §refund-on-failure).
    update credit_buckets
      set current_balance = current_balance + j.credit_estimate
      where account_id = j.account_id;

    insert into credit_events (account_id, learner_id, delta, reason, reference_id)
      values (j.account_id, j.learner_id, j.credit_estimate,
              'materials_create_refund', j.material_id);
  end loop;
end;
$$;

-- Sweep every 5 minutes.
select cron.schedule(
  'lb-extraction-sweep',
  '*/5 * * * *',
  $$select lb_sweep_stale_extractions();$$
);

-- Drive the worker (drains the queued jobs) every minute. The API endpoint
-- lives on the app server, authenticated by a shared secret.
create or replace function lb_invoke_extraction_worker()
returns void language plpgsql security definer as $$
declare
  _url    text := current_setting('app.api_url', true) || '/materials-worker/drain';
  _secret text := current_setting('app.extraction_worker_secret', true);
begin
  perform net.http_post(
    url     := _url,
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-worker-secret', _secret
               ),
    body    := '{}'::jsonb
  );
end;
$$;

select cron.schedule(
  'lb-extraction-worker',
  '* * * * *',
  $$select lb_invoke_extraction_worker();$$
);
