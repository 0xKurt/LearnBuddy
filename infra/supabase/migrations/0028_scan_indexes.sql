-- Scheduler and recovery queries that ran every minute over whole tables
-- (audit jobs-and-llm-calls-never-pruned-payload-scans, p2-recovery-scans-never-pruned-tables-every-minute).
-- docs/architecture.md §Background work.

-- "Is a reading (or photo purge) of this material still queued?" — tick recovery, retry
-- counting and the photo sweep look jobs up by the material in their payload.
create index if not exists jobs_material_idx on jobs (kind, (payload ->> 'material_id'));

-- Stalled turns: only the few messages still being processed, never the whole history.
create index if not exists buddy_messages_processing_idx on buddy_messages (claimed_at)
  where status = 'processing';
