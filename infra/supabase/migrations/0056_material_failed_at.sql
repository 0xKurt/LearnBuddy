-- When a sheet failed (issue #115). Until now the home read "a reading that failed recently"
-- from `created_at` — the moment the photos were reserved. That works while a sheet fails
-- minutes after it was sent, and breaks for the one case the learner needs most: a send that
-- never finished is given up a full day after `created_at`, so its card was already outside
-- the 24-hour window and never appeared. The moment of the failure is its own fact.
--
-- Rows that are failed now get their `updated_at` (the last write on them was that failure or
-- its photo purge, minutes apart); rows that never failed keep null.

alter table materials add column if not exists failed_at timestamptz;

update materials set failed_at = updated_at where status = 'failed' and failed_at is null;

comment on column materials.failed_at is
  'When the reading of this sheet failed (status = failed). Null: it never failed.';
