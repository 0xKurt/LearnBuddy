-- Wipe all user data from the remote dev database.
-- Run via: pnpm db:wipe
--
-- accounts has ON DELETE CASCADE to virtually everything. Truncating it
-- (plus the few tables that don't reference accounts) is sufficient.
-- restart identity resets any sequences back to 1.

truncate
  cron_locks,
  rate_limit_counters,
  idempotency_keys,
  accounts          -- cascades → subscriptions, credit_buckets, credit_events,
                    --            learners, subjects, folders, materials, items,
                    --            item_states, sessions, attempts, practice_runs,
                    --            problem_templates, study_assets, material_photos,
                    --            outbox, dsgvo_requests
restart identity cascade;
