-- Session lifecycle: nothing answered gets lost, and nothing stays open forever
-- (docs/architecture.md §Practice, session lifecycle; audit I-3, I-4, decision D-5).
--
-- - deferred_at: homework help "Später". The task stays open (nothing solved, nothing
--   shown) and moves behind the other open tasks; the open task shown next is the first one
--   without deferred_at, then the one set aside longest ago. Answering it clears the mark.
-- - Idle sessions are closed by the scheduler (practice/lifecycle.ts): a help session 14 days
--   after its last activity, every other session after 3 days; the step it belonged to goes
--   back to 'prepared'. The partial index keeps that sweep cheap.
alter table session_items add column deferred_at timestamptz;

create index practice_sessions_active_idle_idx on practice_sessions(last_activity_at)
  where status = 'active';
