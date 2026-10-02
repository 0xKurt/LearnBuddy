-- Lernkarten: a pass where the card turns over and SHE says whether she knew it (issue #147,
-- Stufe 2; owner decision 02.10.2026 "Stufe 1 und 2: dazu Lernkarten").
--
-- The one thing that must not go wrong here is the weight of that answer. It is NOT checked —
-- nobody compared it against the key — so the spaced-repetition schedule must not come out of
-- it carrying a certainty nobody measured (CLAUDE.md rule 5; the mirror image of issue #197,
-- where a judgement was invented for a free text). Three CHECK constraints are widened so
-- that "not checked" is recorded as its own fact instead of disappearing into the ordinary
-- columns. No new table, no new column on `session_items` or `item_states`: the facts already
-- have their places, they were only missing these values.

-- ─────────────── which pass this run is ───────────────
--
-- Deliberately NOT a new `mode`. A card pass is practice — her own words, her own sheet,
-- feeding the same spaced repetition — and `mode` is read far outside this module: Buddy's
-- home card, his recall of finished sessions, the session lifecycle, the tutor prompt, and
-- `NowCard.mode` in `packages/shared-types/src/contracts/buddy.ts`, which validates against
-- exactly ('practice','test','help'). A fourth mode would reach the app as a card the home
-- screen cannot parse. So `mode` stays, and one nullable column says which pass this is —
-- read in exactly one module (`modules/practice/`), where the code enforces that a card pass
-- takes no typed answer, no hint and no "Lösung zeigen", and an answered run takes no card.
alter table practice_sessions
  add column pass text check (pass in ('cards'));

comment on column practice_sessions.pass is
  'Which kind of pass this run is. null: questions are answered and checked (the ordinary run). cards: a flashcard pass — the card turns over and the learner says herself whether she knew it, so nothing in it is graded. Issue #147.';

-- ─────────────── how the closing answer was given ───────────────
--
-- 'self_rated' joins 'tapped' and 'spoken' for the same reason those exist (issue #163):
-- the form of an answer is evidence of its own, and the answer text no longer shows it. A
-- word she TAPPED from four of her own is recognition rather than production; a word she
-- reports having known is not even recognition that anything checked. So the summary counts
-- it as work she did and never lets it name a topic as one that went well.
alter table session_items drop constraint session_items_answered_by_check;
alter table session_items add constraint session_items_answered_by_check
  check (answered_by in ('typed', 'tapped', 'spoken', 'self_rated'));

comment on column session_items.answered_by is
  'How the closing answer was given: typed, tapped (a choice offered by the app), spoken, or self_rated (a flashcard she judged herself — nothing checked it). Recognition, production and self-assessment are different evidence and must stay distinguishable. Issues #163, #147.';

-- ─────────────── the mark on the review itself ───────────────
--
-- `last_outcome` is what "secure" and "shaky" are read from, and it is the place a later
-- reader asks "what was this interval actually built on?". A self-assessment has to be
-- legible there, or in a month nothing tells the two apart: 'self_known' and 'self_unknown'
-- are her own report, 'first_try' / 'with_help' / 'revealed' are observations. The ratings
-- they map to, and why they are deliberately not symmetrical, are argued in
-- `apps/api/src/modules/practice/fsrs.ts`.
alter table item_states drop constraint item_states_last_outcome_check;
alter table item_states add constraint item_states_last_outcome_check
  check (last_outcome in ('first_try', 'with_help', 'revealed', 'self_known', 'self_unknown'));

comment on column item_states.last_outcome is
  'How the last review of this question came about. Observed: first_try, with_help, revealed. Reported by the learner on a flashcard, with nothing checking it: self_known, self_unknown. Issues #147, #163.';
