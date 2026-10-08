-- A guided worked example (issue #298: Vormachen → Mitmachen → Selbermachen; worked examples
-- that fade step by step, Renkl & Atkinson 2003). A question that is solved by transforming an
-- equation or a term keeps its way as steps: one line of maths and a short note per step.
--   [{"line": "2(x + 3) = 14", "note": "Die Gleichung"},
--    {"line": "2x + 6 = 14",   "note": "Klammer auflösen"}, …, {"line": "x = 4", "note": "…"}]
--
-- Written by the background hints call that already exists (apps/api/src/modules/practice/hints.ts)
-- and kept only when code proves it (practice/workedSteps.ts):
--   - every line follows from the one before (`checkPath`, steps.ts);
--   - the first line stands in the question;
--   - the last line is the key.
-- A way that fails any of those is not stored at all.
-- Kept, its steps between the first and the last are the question's hint ladder: each „Tipp"
-- shows the next one, never the result. Once a step is shown, the line she writes is checked
-- against the first line.
--
-- One jsonb column of {line, note} objects rather than two arrays: a line and its note can never
-- drift apart. Null where no way was kept; no backfill.
--
-- The check holds the shape the code reads, so nothing else can be stored there: an array of at
-- least three objects, each with a non-empty text `line` and `note`. The CASE keeps
-- `jsonb_array_length` away from anything that is not an array (Postgres does not promise to
-- evaluate AND from left to right). Two paths: the strict one finds an element that is no object
-- (lax would unwrap a nested array), the lax one an object without both texts (strict would
-- error on a missing key, and an error counts as no match).

alter table items add column if not exists worked_steps jsonb;

alter table items add constraint items_worked_steps_shape check (
  worked_steps is null
  or case
    when jsonb_typeof(worked_steps) <> 'array' then false
    else jsonb_array_length(worked_steps) >= 3
      and not jsonb_path_exists(worked_steps, 'strict $[*] ? (@.type() != "object")')
      and not jsonb_path_exists(
        worked_steps,
        'lax $[*] ? (!(@.line.type() == "string" && @.note.type() == "string" && @.line != "" && @.note != ""))'
      )
  end
);

comment on column items.worked_steps is
  'The way of a question solved by transforming an equation or a term (issue #298): [{line, note}], at least 3, proven by code (practice/workedSteps.ts); its middle steps are the hint ladder. Null where none was kept.';
