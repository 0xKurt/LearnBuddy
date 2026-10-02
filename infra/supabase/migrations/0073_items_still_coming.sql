-- A practice run may start before all its questions are written (issue #220).
--
-- Measured, 02.10.: "üben wir Brüche" costs 6,45 s wall-clock at the endpoint, of which the
-- `explain` call is 6,42 s for 1 432 written tokens and 0 thought tokens — pure writing time at
-- the documented 250–300 tokens a second (docs/decisions/prefix-cache-2026-10-01.md). Nine
-- questions are written before she sees the first one, although three are enough to start.
--
-- So the generator writes the first three, the run starts, and the rest is written behind her
-- while she works. That turns one fact into a state the server has to carry: for a few seconds a
-- run holds FEWER questions than it will hold, and "nothing is open any more" no longer means
-- "this run is over".
--
-- That is what this column is for, and it exists BEFORE the refill does (the issue's own order:
-- "Ohne das darf nichts davon live gehen"). Without it the loss is concrete: she answers the
-- three questions, `finishIfComplete` sees no open question, the run is finished, Buddy's step
-- gets its evidence — and the six questions that were still being written land in a run that is
-- already over. A practice that says "done" after three questions is a lost learning run, and it
-- would look like a finished one in every number the app keeps.
--
-- Why an instant and not a flag: a flag that the refill fails to clear (a killed process, the
-- provider gone) would leave the run unfinishable forever — the learner could never get her
-- result. The instant is a deadline: past it the run is an ordinary run again, with the questions
-- it actually has. Code compares it against `deps.now()`; SQL never decides it (CLAUDE.md rule 7).
--
-- Null is the normal state and the only state every other kind of run ever has: a test, a typed
-- vocabulary list, a speaking run and homework help are written in one go, because a test that
-- grows while it is being written is not a test and a list she typed is already complete.
alter table practice_sessions add column items_pending_until timestamptz;

comment on column practice_sessions.items_pending_until is
  'Set while more questions for this run are still being written (issue #220): until this instant "no open question" does not finish the run, and the app shows no question count that would still change. Cleared when the rest lands or is given up on; past it the run counts as complete with what it has. Compared against the app clock, never SQL now().';
