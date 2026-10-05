-- Two new learning sources (issue #259, #224 Baustein QUELLE): a corrected class test and the
-- notebook entry of the day (Hefteintrag).
--
-- Until now every photo was read as a worksheet. A corrected test became questions about every
-- task on it, the red marks were ignored, and its faithful transcription kept the grade and the
-- teacher's remarks for as long as the sheet lived. A notebook entry was read like any page and
-- nothing knew it was "what was in today's lesson" — the stuff an unannounced test (in Bavaria
-- the Stegreifaufgabe/Ex) asks about the next day.
--
-- The reading now says what kind of page it is (`MaterialSource` in
-- packages/shared-types/src/contracts/learning.ts); code decides what follows from it
-- (apps/api/src/modules/materials/sources.ts, CLAUDE.md rule 1):
--
--   1. `materials.source`: sheet · corrected_test · notebook_entry. Nothing about the grade is
--      stored here or anywhere else — there is no column and no field for it.
--   2. A corrected test on which nothing is marked wrong has nothing to practise: it fails with
--      its own reason, final like `form_not_practicable`, and its photos go at once.
alter table materials
  add column source text not null default 'sheet'
    check (source in ('sheet', 'corrected_test', 'notebook_entry'));

comment on column materials.source is
  'What kind of page the reading recognised: sheet, corrected_test (only the marked tasks become new practice tasks; no grade or points are stored; photos deleted right after the reading) or notebook_entry (a handful of short questions about the lesson). Issue #259.';

-- The eighth honest failure reason, added the way 0067 added `form_not_practicable`.
alter table materials drop constraint materials_failure_reason_check;
alter table materials
  add constraint materials_failure_reason_check check (failure_reason in (
    'photos_missing','unreadable','not_learning_material','model_error','budget_exhausted','blocked',
    'form_not_practicable','nothing_marked'
  ));
