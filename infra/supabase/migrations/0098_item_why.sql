-- „Warum stimmt das?" (issue #388, report „Hilfe und Fragen beim Üben" §5.3): after a question has
-- closed, she taps one of three reasons. One of them is the rule or concept that makes the
-- solution right. This is self-explanation (Bisra et al. 2018, g = 0.55; Aleven & Koedinger): she
-- needs to type nothing, and no word list is involved. Her tap decides, and code compares it with
-- the key.
--
-- The reasons belong to the question. The background call that already writes a question's
-- hints and worked solution writes them at the same moment
-- (apps/api/src/modules/practice/hints.ts). So her tap costs no model call. Code checks them
-- before they are kept: exactly three distinct reasons, the key one of them, and none that states
-- the solution (so the right one cannot be spotted by its answer).
--
-- Shape: {"reasons": [three short sentences], "correct": 0..2}. Null where none were written.
-- There is no backfill. A question without reasons keeps "Warum ist das so?", the re-explanation
-- that already exists.
--
-- Her tap and the app's reply are practice turns with `reexplain = 'why'` (migration 0036). They
-- stand after the solution like every "why" exchange and are kept, exported and deleted with them.

alter table items add column if not exists why jsonb;

alter table items add constraint items_why_shape check (
  why is null or (
    jsonb_typeof(why -> 'reasons') = 'array'
    and jsonb_array_length(why -> 'reasons') = 3
    and jsonb_typeof(why -> 'correct') = 'number'
    and (why ->> 'correct')::int between 0 and 2
  )
);

comment on column items.why is
  'Three reasons for "Warum stimmt das?" (issue #388): {reasons: [3], correct: 0..2}, written with the hints (practice/hints.ts) and checked by code; null where none were written.';
