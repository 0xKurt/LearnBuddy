-- 0016 — Erasure that actually happens (D-7, D-9).
-- Source: docs/privacy.md §What is stored, §Export and deletion; docs/architecture.md §Background work.
--
--   * purge_content: "Blatt löschen" / "Frage löschen" really delete the transcript and the
--     questions (with their answers and memory state), not only hide them (D-7).
--   * accounts.deletion_started_at: set (app clock) when the deletion job begins. From then
--     on it cannot be cancelled and the account refuses further writes.
--   * storage_deletions: photo paths whose removal from Storage is still owed. An account
--     deletion does not wait for Storage (D-9); these rows are retried with backoff until
--     the objects are gone, and /health reports them. Paths only (account and material ids),
--     no learner reference, so the rows outlive the account they belonged to.
--   * materials.content_purged_at: when the content of a deleted material was erased.
--   * buddy_memories.closed_at: when a memory was removed or replaced (app clock); its
--     statement and quote are erased once the 7-day undo window has passed.

alter table jobs drop constraint jobs_kind_check;
alter table jobs add constraint jobs_kind_check check (kind in (
  'extract_material','buddy_check','buddy_turn','purge_photos','delete_account','purge_content'
));

alter table accounts add column deletion_started_at timestamptz;

create table storage_deletions (
  path text primary key check (length(path) between 1 and 300),
  reason text not null check (reason in ('account_deleted','material')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null,
  last_error text check (last_error is null or length(last_error) <= 200),
  created_at timestamptz not null
);
create index storage_deletions_due_idx on storage_deletions(next_attempt_at);
alter table storage_deletions enable row level security;

alter table materials add column content_purged_at timestamptz;

alter table buddy_memories add column closed_at timestamptz;
-- Memories closed before this migration start their undo window at their last change.
update buddy_memories set closed_at = updated_at where status <> 'active';
create index buddy_memories_closed_idx on buddy_memories(closed_at) where closed_at is not null;

-- Erasure jobs parked by earlier versions (3 failed attempts) are picked up again: they are
-- never given up now (deletion-job-parks-failed-account-stuck).
update jobs set status = 'queued', attempts = 0, finished_at = null, lease_token = null,
                lease_until = null
 where kind in ('delete_account','purge_photos') and status = 'failed';
