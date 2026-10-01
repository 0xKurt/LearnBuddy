-- How she answered, not only whether she was right (issue #163).
--
-- Since issue #147 a vocabulary question she is RECOGNISING can be answered by tapping one
-- of four of her own words. That is a real way in — and a weaker piece of evidence than
-- writing the word: a class test asks her to produce it, and someone who can only
-- recognise looks exactly as good in the app. The tap travels as ordinary text so grading
-- stays one path (that was the point), which is precisely why the form has to be recorded
-- separately — the answer itself no longer shows it.
--
-- 'spoken' is its own kind for the same reason: a recording tests pronunciation and oral
-- recall, not reliably spelling.
alter table session_items
  add column answered_by text check (answered_by in ('typed', 'tapped', 'spoken'));

comment on column session_items.answered_by is
  'How the closing answer was given: typed, tapped (a choice offered by the app) or spoken. Recognition and production are different evidence and must stay distinguishable. Issue #163.';
