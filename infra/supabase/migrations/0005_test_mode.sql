-- Test mode (docs/architecture.md §Learning modes): one try per question, no
-- hints, feedback at the end. A question answered wrong in a test is closed
-- as 'missed' (not 'revealed' or 'skipped': she tried, and nothing was shown).

alter table session_items drop constraint session_items_status_check;
alter table session_items add constraint session_items_status_check
  check (status in ('open','correct','revealed','skipped','missed'));
