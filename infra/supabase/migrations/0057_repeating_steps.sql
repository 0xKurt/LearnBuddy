-- Repeating agreed reminders (issue #112).
--
-- "Erinner mich jeden Tag um 5" is the most ordinary thing a child asks a learning companion,
-- and until now it could only be answered as a handful of single steps — six plan_step actions
-- against the action cap, then silence. That is the unproven promise rule 5 forbids.
--
-- The repetition lives on the agreed step itself, and the step moves to its next date once its
-- reminder has fired. No row per occurrence: rule 6 forbids showing a learner counts of missed
-- days, so a history of occurrences would be data we must never use.
alter table buddy_steps
  -- null = happens once, as before.
  add column repeat text check (repeat in ('daily', 'weekdays', 'weekly')),
  -- The last day it may still fire (learner-local). Null = until she ends it.
  add column repeat_until date;

-- Only an agreed reminder repeats: Buddy's own suggestion is one suggestion, not a standing
-- arrangement (ADR 0006 — contact is opt-in and Buddy can only reduce it).
alter table buddy_steps
  add constraint buddy_steps_repeat_is_agreed
    check (repeat is null or (agreed and planned_time is not null));

alter table buddy_steps
  add constraint buddy_steps_repeat_until_needs_repeat
    check (repeat_until is null or repeat is not null);
