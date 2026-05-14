// FSRS scheduling wrapper. Doc 02 §F2, doc 05 §practice, doc 03 §item_states.
//
// ts-fsrs operates on a Card structure with the same fields as our
// `item_states` row (state, stability, difficulty, due, etc). We map our
// Verdict enum to FSRS Rating enum.

import {
  createEmptyCard,
  fsrs,
  type Card,
  generatorParameters,
  type Grade,
  Rating,
  type State,
} from 'ts-fsrs';
import type { ItemState, Verdict } from '@learnbuddy/shared-types';

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

export function verdictToRating(verdict: Verdict): Grade {
  switch (verdict) {
    case 'correct':
      return Rating.Good as Grade;
    case 'partially_correct':
      return Rating.Hard as Grade;
    case 'incorrect':
    case 'skipped':
      return Rating.Again as Grade;
  }
}

export function emptyCardFor(itemId: string, learnerId: string, now = new Date()): ItemState {
  const card = createEmptyCard(now);
  return cardToItemState(card, itemId, learnerId);
}

export function review(
  state: ItemState,
  verdict: Verdict,
  now: Date = new Date(),
): ItemState {
  const card = itemStateToCard(state);
  const result = scheduler.next(card, now, verdictToRating(verdict));
  return cardToItemState(result.card, state.item_id, state.learner_id);
}

function itemStateToCard(state: ItemState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsed_days,
    scheduled_days: state.scheduled_days,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.last_review ? new Date(state.last_review) : undefined,
  };
}

function cardToItemState(card: Card, itemId: string, learnerId: string): ItemState {
  return {
    item_id: itemId,
    learner_id: learnerId,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as 0 | 1 | 2 | 3,
    last_review: card.last_review ? card.last_review.toISOString() : null,
    due: card.due.toISOString(),
    mastery_score: Math.min(100, Math.max(0, Math.round(card.stability * 5))),
    updated_at: new Date().toISOString(),
  };
}

// Pick due items for a session. Bias to folder items where a folder has a
// `scheduled_for` date in the next 7 days. Doc 05 §subject.
export function pickDueItems<T extends { item_id: string; due: string }>(
  states: T[],
  max: number,
  now: Date = new Date(),
): T[] {
  const nowMs = now.getTime();
  // Due first, then nearly-due, by due time ascending.
  const sorted = [...states].sort(
    (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime(),
  );
  const due = sorted.filter((s) => new Date(s.due).getTime() <= nowMs);
  if (due.length >= max) return due.slice(0, max);
  // Fill with the next-most-due upcoming items.
  return [...due, ...sorted.filter((s) => new Date(s.due).getTime() > nowMs).slice(0, max - due.length)];
}
