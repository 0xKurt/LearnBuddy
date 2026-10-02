-- Which of the twelve state-dependent curriculum places a question belongs to (issue #214).
--
-- `learners.curriculum_region` (migration 0068, issue #199) says which Bundesland decides what
-- counts as a right answer. This column is the other half: which PLACE a question is at, so
-- that when the answer is judged, code can look up what that state expects there
-- (apps/api/src/modules/curriculum/points.ts, docs/lehrplan-und-uebungsformen.md).
--
-- Written once, when the question is written: the model tags the question with one of the keys
-- the table holds (a closed zod enum, ItemDraft.curriculum_point) and nothing else. NULL means
-- "at none of the twelve places", which is almost every question.
--
-- DELIBERATELY NO CHECK CONSTRAINT, unlike 0068. The sixteen Bundesländer are a closed list
-- that will not change; the list of researched places grows with every curriculum anyone
-- reads, and migrations are immutable (CLAUDE.md rule 10), so a CHECK here would mean a new
-- migration for every new place. The validation is the zod enum at the only write path
-- (practice/items.ts insertItems), and reading is forgiving on purpose: a value the table no
-- longer knows is read as "no place", which is the cautious default — the same thing a learner
-- with no Bundesland gets. An unknown key can therefore never make a judgement wrong, only
-- less specific.

alter table items
  add column curriculum_point text;

comment on column items.curriculum_point is
  'One of the state-dependent curriculum places from apps/api/src/modules/curriculum/points.ts '
  '(issue #214), or NULL for a question at none of them. Together with learners.curriculum_region '
  'it decides which state''s rule the tutor is told about and whether a question belongs in a '
  'practice test for her Bundesland. Not CHECK-constrained: the list of places grows with the '
  'research, and an unknown value is read as "no place" (the cautious default).';
