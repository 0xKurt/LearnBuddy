-- A practice test with a time limit, only when she asks for it in the chat (issue #241,
-- „mit Zeit, wie in der Arbeit“; decided in #224: no switch, no setting — on her wish only).
--
-- Two facts, kept apart because they come into being at different moments:
--
-- - time_limit_minutes: what she asked for. Set when the run is created, from Buddy's offer.
--   The model never writes a number of its own (CLAUDE.md rule 2): the value comes from a fixed
--   list (10/20/30/45/60/90), and the CHECK holds the database to that list too.
-- - deadline_at: when her time is up. Set by the server the first time SHE opens the test, not
--   when it was written — Buddy prepares an offered test while she is still reading his reply
--   (issue #48), and those seconds are not hers to lose. Computed from `deps.now()` (rule 7);
--   SQL never compares it with now().
--
-- An answer that arrives after the deadline (plus a small allowance for the network) is not
-- graded; the run then ends, and every question still open counts as not answered — never as
-- wrong (modules/practice/service.ts, testClock).
--
-- Null in both is the normal state and the only state every other run ever has. A time limit
-- belongs to a test, so the CHECK refuses it on practice, help and card passes.
alter table practice_sessions
  add column time_limit_minutes smallint
    check (time_limit_minutes in (10, 20, 30, 45, 60, 90)),
  add column deadline_at timestamptz;

alter table practice_sessions
  add constraint practice_sessions_time_limit_test
    check (time_limit_minutes is null or mode = 'test'),
  add constraint practice_sessions_deadline_needs_limit
    check (deadline_at is null or time_limit_minutes is not null);

comment on column practice_sessions.time_limit_minutes is
  'A practice test with a time limit she asked for in the chat (issue #241): one of 10, 20, 30, 45, 60, 90 minutes, never a number the model made up. Null for every run without a limit — the default, and the only value outside mode test.';
comment on column practice_sessions.deadline_at is
  'When the time of a timed test is up (issue #241): set by the server from the app clock the first time she opens the test, not when it was prepared. An answer after it (plus a small network allowance) is not graded. Compared against the app clock, never SQL now().';
