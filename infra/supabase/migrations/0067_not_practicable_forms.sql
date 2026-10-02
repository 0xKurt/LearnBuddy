-- Buddy can say that he cannot practise an exercise form (issue #198).
--
-- Until now `extract.ts` was told to write eight to fifteen questions for every readable
-- sheet, and `materials.failure_reason` had no value for "I cannot practise this form". A
-- sheet whose only task is "Erörtern Sie …" was therefore read fine and quietly turned into
-- knowledge questions about its own text: the questions were not wrong, but the exercise she
-- photographed never happened, and the sheet looked done afterwards. That is the silent
-- substitution of issue #150 one layer up (docs/lehrplan-und-uebungsformen.md §12.3).
--
-- Two changes, and nothing is deleted:
--
--   1. Every task that got no questions because of its form is kept per sheet, with the task
--      as printed, so Buddy can name it in her words and the app can say it on the card. A
--      sheet with five sums and one essay keeps the five questions AND the one honest
--      sentence — never six questions, never none.
--   2. A sheet where NOTHING was practicable fails with its own reason instead of
--      `model_error` or `unreadable`: the photo was fine, so no lighting advice, and no
--      "Nochmal lesen" — reading it again cannot change the form of the task. Unlike
--      `not_learning_material` and `blocked`, its photos are kept for the normal retention:
--      the sheet is valid school material and she may want to look at it.
--
-- The list of forms itself lives in the contract (`NotPracticableForm` in
-- packages/shared-types/src/contracts/learning.ts), not in the prompt: it decides a state the
-- app shows and a retry the API refuses, so it is code, not a suggestion (CLAUDE.md rule 1).
alter table materials
  add column not_practicable jsonb not null default '[]'::jsonb
    check (jsonb_typeof(not_practicable) = 'array');

comment on column materials.not_practicable is
  'Tasks on this sheet that got no questions because their exercise form cannot be practised: [{"task": as printed, "form": NotPracticableForm}]. Said out loud on the card and in Buddy''s state — a task nobody mentions would look done. Issue #198.';

-- The seventh honest failure reason, added the way 0020 added `blocked`.
alter table materials drop constraint materials_failure_reason_check;
alter table materials
  add constraint materials_failure_reason_check check (failure_reason in (
    'photos_missing','unreadable','not_learning_material','model_error','budget_exhausted','blocked',
    'form_not_practicable'
  ));
