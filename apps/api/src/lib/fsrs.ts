// FSRS scheduling helpers. Doc 03 §item_states + ts-fsrs.
//
// Server-side replay for the offline outbox: takes the current item_state
// row, applies a single attempt with the given verdict, returns the next
// state to persist. Mirrors mobile's local FSRS so server + client stay in
// sync after a drain.

import { Rating, createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs';

const scheduler = fsrs({});

export type ItemStateRow = {
  item_id: string;
  learner_id: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  due: string;
  mastery_score: number;
};

export type Verdict = 'correct' | 'partially_correct' | 'incorrect' | 'skipped';

/** Effort signal — Phase A5. Tells FSRS that a "correct" answer came
 *  with help, not cold. Two channels:
 *    - hintsUsed:           tutor turns on THIS item that were non-Genau
 *                            (incorrect | partially_correct | skipped).
 *    - priorWrongAttempts:  learner attempts on THIS item that were wrong
 *                            or skipped BEFORE this correct one. */
export type EffortSignal = {
  hintsUsed: number;
  priorWrongAttempts: number;
};

/** Map a verdict to an FSRS rating. The effort signal downgrades a
 *  scaffolded correct from `Good` to `Hard`: a learner who needed help
 *  to get there is not at the same mastery level as one who got it
 *  cold. Spaced-rep schedules accordingly — Hard means "re-surface
 *  sooner". Wrong / skipped verdicts are unaffected (still `Again`). */
function verdictToRating(v: Verdict, effort: EffortSignal): Grade {
  if (v === 'correct') {
    return effort.hintsUsed > 0 || effort.priorWrongAttempts > 0 ? Rating.Hard : Rating.Good;
  }
  if (v === 'partially_correct') return Rating.Hard;
  return Rating.Again;
}

const NO_EFFORT: EffortSignal = { hintsUsed: 0, priorWrongAttempts: 0 };

function rowToCard(row: ItemStateRow | null): Card {
  if (!row) return createEmptyCard();
  const base = createEmptyCard();
  return {
    ...base,
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
  };
}

export function applyAttempt(
  prev: ItemStateRow | null,
  verdict: Verdict,
  reviewedAt: Date,
  effort: EffortSignal = NO_EFFORT,
): Omit<ItemStateRow, 'item_id' | 'learner_id'> {
  const card = rowToCard(prev);
  const result = scheduler.next(card, reviewedAt, verdictToRating(verdict, effort));
  const next = result.card;

  // Mastery score: simple v1 — interval-based 0..100.
  const masteryScore = Math.max(
    0,
    Math.min(100, Math.round(Math.min(60, next.scheduled_days) * (100 / 60))),
  );

  return {
    stability: next.stability,
    difficulty: next.difficulty,
    elapsed_days: next.elapsed_days,
    scheduled_days: next.scheduled_days,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    last_review: next.last_review ? next.last_review.toISOString() : reviewedAt.toISOString(),
    due: next.due.toISOString(),
    mastery_score: masteryScore,
  };
}
