// FSRS effort-aware scheduling — Phase A5.
//
// Verifies that `applyAttempt` honors the EffortSignal: a "correct"
// answer that required hints OR followed prior wrong attempts on the
// same item is scheduled as Hard, not Good — so spaced rep resurfaces
// it sooner. A cold-correct (no hints, no prior wrong) stays Good.
//
// Wrong / skipped / partially_correct verdicts are unaffected by effort.

import { describe, expect, it } from 'vitest';

import { applyAttempt } from '../fsrs.js';

const REVIEW = new Date('2026-05-19T12:00:00Z');

describe('applyAttempt — effort-aware scheduling', () => {
  it('schedules a cold correct (no effort) as Good — valid forward interval', () => {
    const next = applyAttempt(null, 'correct', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    // ts-fsrs on a fresh card uses the per-state initial interval. For
    // a brand-new card with Rating.Good the interval is small (~10
    // minutes); the substantive test is that effort DOWNGRADES this —
    // see the next test. Here we just sanity-check the schedule moves
    // forward and the row is valid.
    expect(Date.parse(next.due)).toBeGreaterThanOrEqual(REVIEW.getTime());
    expect(next.scheduled_days).toBeGreaterThanOrEqual(0);
    expect(next.reps).toBe(1);
  });

  it('schedules a correct-after-hints as Hard — shorter due than cold correct', () => {
    const cold = applyAttempt(null, 'correct', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    const scaffolded = applyAttempt(null, 'correct', REVIEW, {
      hintsUsed: 2,
      priorWrongAttempts: 0,
    });
    // Hard's interval is shorter than Good's on a fresh card.
    expect(Date.parse(scaffolded.due)).toBeLessThan(Date.parse(cold.due));
  });

  it('schedules a correct-after-prior-wrong as Hard (no hints, but had attempts)', () => {
    const cold = applyAttempt(null, 'correct', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    const corrected = applyAttempt(null, 'correct', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 1,
    });
    expect(Date.parse(corrected.due)).toBeLessThan(Date.parse(cold.due));
  });

  it('leaves incorrect untouched by effort signal (still Again)', () => {
    const a = applyAttempt(null, 'incorrect', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    const b = applyAttempt(null, 'incorrect', REVIEW, {
      hintsUsed: 3,
      priorWrongAttempts: 2,
    });
    // Both routed through Rating.Again; same scheduled_days.
    expect(a.scheduled_days).toBe(b.scheduled_days);
  });

  it('leaves skipped untouched by effort signal (still Again)', () => {
    const a = applyAttempt(null, 'skipped', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    const b = applyAttempt(null, 'skipped', REVIEW, {
      hintsUsed: 5,
      priorWrongAttempts: 5,
    });
    expect(a.scheduled_days).toBe(b.scheduled_days);
  });

  it('treats partially_correct as Hard regardless of effort (unchanged behaviour)', () => {
    const a = applyAttempt(null, 'partially_correct', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    const b = applyAttempt(null, 'partially_correct', REVIEW, {
      hintsUsed: 2,
      priorWrongAttempts: 1,
    });
    // Both Hard — same schedule.
    expect(a.scheduled_days).toBe(b.scheduled_days);
  });

  it('default effort param (no arg passed) preserves legacy Good behaviour', () => {
    // Old call sites that haven't been updated yet still get the
    // pre-A5 schedule (Rating.Good on correct, Again on wrong).
    const a = applyAttempt(null, 'correct', REVIEW);
    const b = applyAttempt(null, 'correct', REVIEW, {
      hintsUsed: 0,
      priorWrongAttempts: 0,
    });
    expect(a.scheduled_days).toBe(b.scheduled_days);
    expect(Date.parse(a.due)).toBe(Date.parse(b.due));
  });
});
