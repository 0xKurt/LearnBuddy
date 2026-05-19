-- 0021 — Make the stale-sweep also schedule the raw photos for wipe.
-- Source: docs/09-privacy.md §4 (raw-photo retention 7d),
--         docs/adr/0003-durable-extraction-pipeline.md.
--
-- Migration 0020's lb_sweep_stale_extractions() marks the job + material
-- 'failed' and refunds the pre-debit, but leaves `scheduled_photo_deletion_at`
-- NULL on the material. The photo-wipe Edge Function only deletes rows whose
-- timestamp is past, so swept materials' raw photos lived in storage forever
-- — a direct §4 retention violation. This rewrites the function (REPLACE,
-- non-destructive) to also stamp now() + 7d on the material, matching what
-- runExtraction's markFailed() does on a non-swept failure.

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
          extraction_error = 'stale_sweep',
          scheduled_photo_deletion_at = coalesce(
            scheduled_photo_deletion_at,
            now() + interval '7 days'
          )
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
