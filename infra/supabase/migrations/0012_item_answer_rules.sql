-- How an answer key is graded, as declared per item (docs/architecture.md §Practice, grading;
-- audit C-2, C-7; decisions D-1, D-2).
--
-- The key itself stays the text the model wrote (a point-decimal number, a fraction, LaTeX,
-- words); code reads it with one canonical parser (packages/shared-math parseCanonicalKey)
-- every time it grades, so old and new rows are graded by the same rules and nothing needs a
-- backfill. What code cannot know from the key is declared here:
-- - tolerance: the ± difference still counted right for a rounded, estimated or measured
--   number. Null (every existing row) means exact — an integer key must match, a decimal key
--   accepts less than half a unit of its last written decimal. Code keeps it only for numeric
--   items and never wider than a tenth of the key (items.ts usableTolerance).
-- - spelling: 'strict' when case, ß and punctuation are what the task practises (a difference
--   is a near miss, never right), 'gentle' when they don't matter (the tutor judges). Null
--   (every existing row): vocabulary and language subjects are strict, everything else gentle.
alter table items
  add column tolerance double precision check (tolerance is null or (tolerance > 0 and tolerance <= 1000000)),
  add column spelling text check (spelling is null or spelling in ('strict', 'gentle'));
