// Spaced repetition: one review per question per practice session, graded by
// how it went — first try without help = Good, needed hints or retries =
// Hard, revealed or skipped = Again. (The legacy app reviewed on every single
// attempt, which is not how FSRS is meant to be fed.)

import { createEmptyCard, fsrs, generatorParameters, Rating, type Card } from 'ts-fsrs';

import type { Db } from '../../lib/db.js';

// No short-term (minutes) learning steps: a question is seen once per
// session, so every review schedules whole days ahead.
const scheduler = fsrs(generatorParameters({ enable_short_term: false }));

export type ItemOutcome = 'first_try' | 'with_help' | 'revealed';

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
};

export async function reviewItem(
  db: Db,
  learnerId: string,
  itemId: string,
  outcome: ItemOutcome,
  now: Date,
): Promise<void> {
  const prev = await db.maybeOne<StateRow>(
    `select due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review
       from item_states where item_id = $1 for update`,
    [itemId],
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
  const rating =
    outcome === 'first_try' ? Rating.Good : outcome === 'with_help' ? Rating.Hard : Rating.Again;
  const next = scheduler.next(card, now, rating).card;
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
