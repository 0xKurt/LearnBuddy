// Spaced repetition: one review per question per practice session, graded by
// how it went — first try without help = Good, needed hints or retries =
// Hard, revealed or skipped = Again. (The legacy app reviewed on every single
// attempt, which is not how FSRS is meant to be fed.)
//
// A flashcard pass feeds the same table through the same function, with its own two
// outcomes — because what she says about a card was never checked, and the schedule must
// not come out of it claiming otherwise (issue #147; see `RATING` below).

import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';

import type { Db } from '../../lib/db.js';

// No short-term (minutes) learning steps: a question is seen once per
// session, so every review schedules whole days ahead.
const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

/**
 * How one review of a question came about.
 *
 * The first three are OBSERVED: code or the tutor compared her answer with the key.
 * The last two are REPORTED — a flashcard turned over and she said herself whether she knew
 * it (issue #147, Stufe 2). Nothing checked those, and the difference is kept all the way
 * into `item_states.last_outcome`, so a later reader can still see what an interval was
 * built on.
 */
export type ItemOutcome = 'first_try' | 'with_help' | 'revealed' | 'self_known' | 'self_unknown';

/**
 * What each outcome is worth to the schedule.
 *
 * The three observed ones are the original ladder: right on the first try without help is
 * `Good`, right after hints or retries is `Hard`, shown or skipped is `Again`.
 *
 * The two reported ones are deliberately NOT symmetrical, and that asymmetry is the whole
 * design of the flashcard pass:
 *
 *   · `self_unknown` ("Noch nicht") → `Again`, exactly what a revealed answer gets. A report
 *     of failure is the one self-assessment that can be taken at face value: nobody claims
 *     to have failed a word they knew, and if she were wrong about it, the only cost is that
 *     the word comes back sooner than it had to. Erring towards more practice claims less,
 *     not more (CLAUDE.md rule 5).
 *
 *   · `self_known` ("Wusste ich") → `Hard`, NOT the `Good` a checked first try earns. `Hard`
 *     still counts as a successful recall — it is not a lapse, the card stays on its way
 *     forward — but it schedules the next look sooner than `Good` would. That is the honest
 *     shape of the evidence: she says she recalled it, and nothing measured whether she did.
 *     Giving it `Good` would let the schedule push the word weeks out on her own say-so, and
 *     the app would then be claiming she knows a word nobody ever saw her produce. Children
 *     over-rate recognition in particular — seeing "le vélo" next to "das Fahrrad" feels
 *     exactly like knowing it — so the error this guards against is the likely one.
 *
 * It is the same decision as `answered_by = 'tapped'` (issue #163), one layer deeper: a
 * weaker kind of evidence counts, and counts for less, instead of being either thrown away
 * or quietly promoted to the strong kind.
 */
export const RATING: Record<ItemOutcome, Grade> = {
  first_try: Rating.Good,
  with_help: Rating.Hard,
  revealed: Rating.Again,
  self_known: Rating.Hard,
  self_unknown: Rating.Again,
};

type StateRow = {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: Date | null;
  last_outcome: ItemOutcome | null;
};

/**
 * One review of one question — and, in the same transaction and from the same read, the
 * state it overwrites (`session_items.state_before`, issue #164).
 *
 * It is recorded here because this is the only code that changes `item_states`. A question
 * closes in three places — an answer, "Lösung zeigen", a spoken sentence — and when each of
 * them had to remember to write it down beforehand, two of them did not: a judgement she
 * disputed after a reveal or a recording found nothing to go back to and took her whole
 * history for that question with it. Nothing can forget it from here.
 *
 * The two kinds of empty are different on purpose, and `disputeVerdict` reads them apart:
 *   · jsonb `null` — this session reviewed the question and it held nothing before, so
 *     taking the review back means removing the row;
 *   · SQL NULL (never written) — this session never reviewed it (a test, homework help),
 *     so there is no effect of its own to take back and `item_states` is not touched.
 */
export async function reviewItem(
  db: Db,
  learnerId: string,
  sessionId: string,
  itemId: string,
  outcome: ItemOutcome,
  now: Date,
): Promise<void> {
  const prev = await db.maybeOne<StateRow>(
    `select due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state,
            last_review, last_outcome
       from item_states where item_id = $1 for update`,
    [itemId],
  );
  // `JSON.stringify(null)` is the string "null": jsonb null, not SQL NULL (see above).
  await db.query(
    `update session_items set state_before = $3::jsonb where session_id = $1 and item_id = $2`,
    [sessionId, itemId, JSON.stringify(prev ?? null)],
  );
  const card: Card = prev
    ? {
        due: prev.due,
        stability: prev.stability,
        difficulty: prev.difficulty,
        elapsed_days: prev.elapsed_days,
        scheduled_days: prev.scheduled_days,
        reps: prev.reps,
        lapses: prev.lapses,
        state: prev.state,
        ...(prev.last_review ? { last_review: prev.last_review } : {}),
      }
    : createEmptyCard(now);
  const next = scheduler.next(card, now, RATING[outcome]).card;
  await db.query(
    `insert into item_states (item_id, learner_id, due, stability, difficulty, elapsed_days, scheduled_days,
                              reps, lapses, state, last_review, last_outcome, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$11)
     on conflict (item_id) do update set
       due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
       elapsed_days = excluded.elapsed_days, scheduled_days = excluded.scheduled_days, reps = excluded.reps,
       lapses = excluded.lapses, state = excluded.state, last_review = excluded.last_review,
       last_outcome = excluded.last_outcome, updated_at = excluded.updated_at`,
    [
      itemId,
      learnerId,
      next.due,
      next.stability,
      next.difficulty,
      next.elapsed_days,
      next.scheduled_days,
      next.reps,
      next.lapses,
      next.state,
      now,
      outcome,
    ],
  );
}
