-- "Anders erklären" (gaps.md #3, docs/architecture.md §Practice): after an explanation or a
-- shown solution the learner can ask for a new explanation ("Einfacher bitte", "Mit
-- Beispiel", "Warum ist das so?"). Her request and the new explanation are practice turns
-- like every other exchange with the tutor (kept, exported and deleted with them). One about
-- the session's own explanation (explain mode) belongs to no question: item_id may be empty.
alter table practice_turns alter column item_id drop not null;
-- Both turns of such an exchange carry the way she asked for, so the app shows them after the
-- solution (or under the explanation) and not among her tries.
alter table practice_turns
  add column reexplain text check (reexplain in ('simpler', 'example', 'why'));

-- New explanations have their own daily limit (apps/api/src/config.ts DAILY_LIMITS).
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce',
                  'transcribe','hints','reexplain'));
