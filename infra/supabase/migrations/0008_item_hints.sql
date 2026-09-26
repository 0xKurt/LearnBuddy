-- Prepared help for each question (docs/architecture.md §Practice, docs/buddy/03-fahrplan.md §2).
--
-- The model writes 2–3 hints (each more specific: what is asked → which rule →
-- the first step; never the answer) and the solution explained step by step
-- when it prepares a question. While practising, code hands out the next hint
-- at once — no model call, never the same hint twice — and shows the worked
-- solution after the third wrong try. Existing questions keep empty hints and
-- fall back to the tutor model as before.
alter table items
  add column hints text[] not null default '{}',
  add column worked_solution text check (worked_solution is null or length(worked_solution) between 1 and 2000);

-- Hints for questions prepared on a topic are written in the background right after
-- the session starts (the learner does not wait for them): their own daily limit.
alter table usage_daily drop constraint usage_daily_kind_check;
alter table usage_daily add constraint usage_daily_kind_check
  check (kind in ('buddy_turn','buddy_check','tutor','explain','extraction','pronounce','transcribe','hints'));
