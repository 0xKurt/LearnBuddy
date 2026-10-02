// Which of her words go on a flashcard, and where she is offered the pass (issue #147,
// Stufe 2 — owner decision 02.10.2026, "Stufe 1 und 2: dazu Lernkarten").
//
// The rule alone lives here, with no database and no session machinery, because it is read
// from two places: the session view, which already holds the rows of a finished run, and the
// start of a pass, which loads them. One function instead of two SQL predicates that could
// drift apart (CLAUDE.md rule 1). The pass itself is `cardPass.ts`.
//
// Stufe 1 (tapping one of four of her own words instead of typing) is a way INTO an ordinary
// question: the tap travels as text and the same rules grade it (`tapChoices.ts`). A card is
// the opposite kind of thing — nothing is graded at all, she reads the back and reports
// whether she knew it — and `fsrs.ts` RATING is where that difference is paid for honestly.

/** The value `practice_sessions.pass` carries for a flashcard pass (migration 0069). */
export const CARD_PASS = 'cards';

/**
 * One question of a finished run, as far as the card rule needs it. Read in two places from
 * two different queries — the session view (which has the rows already) and the start of a
 * pass — so the rule itself lives in one function rather than in two SQL predicates that
 * could drift (CLAUDE.md rule 1).
 */
export type CardCandidate = {
  kind: string;
  status: 'open' | 'correct' | 'revealed' | 'skipped' | 'missed';
  first_try_correct: boolean | null;
  /**
   * The three "she took this out" marks. Optional in the type because the rows come from
   * queries written elsewhere; a query that does not select them (undefined) and one whose
   * column is empty (null) mean the same thing here — not taken out. `CANDIDATE_COLS` in
   * cardPass.ts names every one of them.
   */
  flagged_at?: Date | null;
  disputed_at?: Date | null;
  /** The question itself was archived (taken out, or its key disputed). */
  archived_at?: Date | null;
};

/**
 * Whether this question of a finished run still wants another look.
 *
 * Right on the first try, without help, is the one thing that does not. Everything else does:
 * wrong, needed hints, had its solution shown, and — in a handed-in test — never got to.
 *
 * The one she took out herself and the one whose judgement she disputed are out of it
 * altogether: the first because she said it does not fit, the second because its key is
 * suspect, so asking it again in any form would repeat the same mistake.
 */
function needsRepeating(c: CardCandidate): boolean {
  if (c.flagged_at != null || c.disputed_at != null || c.archived_at != null) return false;
  return !(c.status === 'correct' && c.first_try_correct === true);
}

/**
 * Whether this question goes on a card.
 *
 * Vocabulary only. The owner's idea was about vocabulary ("ggfs sollten bei vokabeln halt
 * auch lernkarten gemacht werden", 30.09.), and a card needs a short definite back: "sag
 * selbst, ob du den Rechenweg wusstest" is not a thing anyone can answer honestly.
 *
 * And only what did not sit. A word she produced right at once needs no card today; putting
 * it on one would cost it the interval it just earned — a self-assessed `Hard` right after a
 * measured `Good` schedules the word SOONER (fsrs.ts) — which is the opposite of the point.
 *
 * There is no cap on how many cards a pass holds. The owner settled that for question sets
 * and it holds here: "wenn mein kind scheiss 50 vokabeln lernen muss, dann muss sie die
 * scheiss 50 vokabeln lernen … das kunstlich deckeln ist der falsche weg" (30.09.,
 * `selection.ts` §questionCountFor).
 */
export function goesOnACard(c: CardCandidate): boolean {
  return c.kind === 'vocab' && needsRepeating(c);
}

/**
 * Where she reaches a flashcard pass, and why there.
 *
 * Not a menu item, not a setting, not a second kind of practice to choose between (rule 16).
 * It is offered at the end of a FINISHED run of questions, in the one place the app already
 * asks what comes next, and only when that run holds vocabulary that did not sit. Three
 * reasons it belongs exactly there:
 *
 *   · it is the only moment the app knows WHICH words belong on the cards without asking her
 *     anything — intent → result, no list to pick from (docs/UX-PRINCIPLES.md);
 *   · it is the honest order. Every word on the cards has already been measured as one that
 *     did not sit, so the pass adds a repetition rather than a claim: it never has to decide
 *     a word's standing from a self-assessment alone, which is the failure this whole design
 *     is built to avoid;
 *   · a card pass of its own, started cold, would be the ONLY evidence the schedule ever
 *     got about those words. Then FSRS would be running on her own say-so, and rule 5 would
 *     be broken no matter which rating we picked.
 *
 * And only when the cards would BE the whole repetition — every question of that run still
 * wanting another look is vocabulary. That is what lets the offer take the place of "Die
 * wackligen nochmal üben" on the result screen instead of standing next to it: one offer, not
 * a choice between two ways to practise the same words (rule 16). On a mixed sheet, where
 * fractions did not sit either, cards would quietly cover a part of what is left and the
 * screen would be claiming to offer the repetition while dropping half of it.
 *
 * A card pass is not offered after a card pass: it would re-card the words she just said she
 * knew, and shorten their interval for nothing.
 */
export function offersCardPass(
  session: { status: string; pass: string | null },
  items: readonly CardCandidate[],
): boolean {
  if (session.status !== 'finished' || session.pass === CARD_PASS) return false;
  const left = items.filter(needsRepeating);
  return left.length > 0 && left.every((c) => c.kind === 'vocab');
}
