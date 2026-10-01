-- A judgement the learner says is wrong, and the learning state it left behind (issue #164).
--
-- The rule check is certain by design, and that certainty can stand in for an unchecked
-- source: the external audit of 30.09. put a key of `8` on `6 + 4` and watched the right
-- answer `10` be rejected. Issue #157 now drops a key that provably contradicts its own
-- question — but most questions are not arithmetic, and there a wrong key is only visible
-- to the child in front of it.
--
-- "Frage passt nicht" existed and is a different thing: it takes an unfit question out
-- while it is still OPEN. What was missing is the one that matters here — a verdict she has
-- already been given and disagrees with. She must be able to say so without arguing with a
-- tutor that is sure of itself, and without the disagreement costing her learning state.
--
-- `state_before` is what `item_states` held just before this session's review of that
-- question. It is written on every close, so a dispute can put it back exactly; null means
-- the question had no state yet and the row is removed again.
alter table session_items
  add column state_before jsonb,
  add column disputed_at timestamptz;

comment on column session_items.state_before is
  'The item_states row as it stood before this session reviewed the question, so a disputed verdict can be taken back without costing her the history from earlier sessions. Issue #164.';
comment on column session_items.disputed_at is
  'When the learner said this judgement was wrong. The question leaves the result and future practice, and its spaced-repetition effect is undone. Issue #164.';
