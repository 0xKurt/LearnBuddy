-- A stable order for rows made at the same moment (docs/architecture.md §Testing).
--
-- Goals, steps, memories and messages are listed to the model by their creation
-- time, and their aliases (g1, st2, m3) follow that order. Rows made in one
-- turn share the app clock's timestamp, so the order among them was whatever
-- the table happened to hold, and could change once a row was updated. The
-- same for jobs due at the same moment. Found while chasing a test that failed
-- once in about 40 runs (the likely cause, not proven). Each table gets an
-- insertion number as the last tiebreaker.
alter table buddy_goals add column seq bigint generated always as identity;
alter table buddy_steps add column seq bigint generated always as identity;
alter table buddy_memories add column seq bigint generated always as identity;
alter table buddy_outreach add column seq bigint generated always as identity;
alter table subjects add column seq bigint generated always as identity;
alter table materials add column seq bigint generated always as identity;
alter table practice_sessions add column seq bigint generated always as identity;
alter table jobs add column seq bigint generated always as identity;
