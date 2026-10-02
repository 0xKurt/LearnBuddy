// Lernkarten (issue #147, Stufe 2): what a self-assessment is worth, and which words go on a
// card at all.
//
// The one decision this file exists to hold is the WEIGHT. A card is not checked against the
// key — she reads the back and reports whether she knew it — so if "Wusste ich" fed the
// schedule the same rating a measured first try earns, the repetition plan would start
// carrying a certainty nobody measured (CLAUDE.md rule 5, the mirror of issue #197). The
// assertions below are therefore not about the enum values; they are about the INTERVALS that
// come out of them, which is the thing that would actually hurt her if it were wrong.
//
// What this layer cannot see: that the HTTP path writes those outcomes, that another
// learner's pass is a 404, that one tap is recorded once. `__tests__/flashcards.int.test.ts`
// holds that, on a real Postgres.

import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import { goesOnACard, offersCardPass, type CardCandidate } from '../cards.js';
import { RATING } from '../fsrs.js';

const scheduler = fsrs(generatorParameters({ enable_short_term: false }));
const NOW = new Date('2026-10-02T15:00:00Z');

/** When the question would come back after one review of a fresh card. */
function dueAfter(outcome: keyof typeof RATING): number {
  return scheduler.next(createEmptyCard(NOW), NOW, RATING[outcome]).card.due.getTime();
}

const row = (over: Partial<CardCandidate> = {}): CardCandidate => ({
  kind: 'vocab',
  status: 'revealed',
  first_try_correct: false,
  flagged_at: null,
  disputed_at: null,
  archived_at: null,
  ...over,
});

describe('what a self-assessment is worth to the schedule', () => {
  it('schedules a word she SAYS she knew sooner than one she was seen to know', () => {
    // The whole point. `Good` is what a checked first try earns; "Wusste ich" gets `Hard`,
    // which still counts as a recall (it is no lapse) but asks again sooner — because nobody
    // measured it. Giving it `Good` would push the word weeks out on her own say-so.
    expect(dueAfter('self_known')).toBeLessThan(dueAfter('first_try'));
    expect(RATING.self_known).toBe(Rating.Hard);
    expect(RATING.first_try).toBe(Rating.Good);
  });

  it('counts "Wusste ich" as a recall all the same, not as having forgotten it', () => {
    // Weaker than measured is not the same as worthless: it must still be worth more than
    // "Noch nicht", or saying she knew a word would cost her exactly as much as failing it.
    expect(dueAfter('self_known')).toBeGreaterThan(dueAfter('self_unknown'));
  });

  it('believes "Noch nicht" in full, like a solution she had shown to her', () => {
    // The one self-report that can be taken at face value: nobody claims to have failed a
    // word they knew, and being wrong about it only means the word comes back sooner.
    expect(RATING.self_unknown).toBe(Rating.Again);
    expect(dueAfter('self_unknown')).toBe(dueAfter('revealed'));
  });
});

describe('which words go on a card', () => {
  it('takes vocabulary that did not sit, in every shape of "did not sit"', () => {
    expect(goesOnACard(row({ status: 'revealed' }))).toBe(true);
    expect(goesOnACard(row({ status: 'correct', first_try_correct: false }))).toBe(true);
    expect(goesOnACard(row({ status: 'missed' }))).toBe(true);
    // A handed-in test leaves the ones she never got to open: those did not sit either.
    expect(goesOnACard(row({ status: 'open', first_try_correct: null }))).toBe(true);
  });

  it('leaves out the word she produced right at once', () => {
    // It would cost that word the interval it just earned: a self-assessed `Hard` right
    // after a measured `Good` schedules it SOONER, which is the opposite of the point.
    expect(goesOnACard(row({ status: 'correct', first_try_correct: true }))).toBe(false);
  });

  it('is vocabulary only', () => {
    // "Sag selbst, ob du den Rechenweg wusstest" is not a thing anyone can answer honestly.
    for (const kind of ['short', 'long', 'numeric', 'multiple_choice', 'formula', 'speak']) {
      expect(goesOnACard(row({ kind }))).toBe(false);
    }
  });

  it('leaves out what she took out herself, and what she disputed', () => {
    expect(goesOnACard(row({ flagged_at: NOW }))).toBe(false);
    // Its key is suspect, and the card would show her that very key as the right answer.
    expect(goesOnACard(row({ disputed_at: NOW }))).toBe(false);
    expect(goesOnACard(row({ archived_at: NOW }))).toBe(false);
  });
});

describe('where the pass is offered', () => {
  const finished = { status: 'finished', pass: null };

  it('offers it at the end of a finished run that holds words that did not sit', () => {
    expect(offersCardPass(finished, [row()])).toBe(true);
  });

  it('says nothing while the run is still going', () => {
    expect(offersCardPass({ status: 'active', pass: null }, [row()])).toBe(false);
  });

  it('offers nothing when every word sat', () => {
    expect(offersCardPass(finished, [row({ status: 'correct', first_try_correct: true })])).toBe(
      false,
    );
  });

  it('says nothing when the repetition is not only words', () => {
    // On a sheet where fractions did not sit either, cards would cover a part of what is
    // left — and the offer stands in the place of "Die wackligen nochmal üben", so it would
    // be claiming to be the repetition while dropping half of it.
    expect(offersCardPass(finished, [row(), row({ kind: 'numeric' })])).toBe(false);
    // The maths that DID sit changes nothing: there is nothing left of it to repeat.
    expect(
      offersCardPass(finished, [
        row(),
        row({ kind: 'numeric', status: 'correct', first_try_correct: true }),
      ]),
    ).toBe(true);
  });

  it('never offers cards after cards', () => {
    // It would re-card the words she just said she knew and shorten their interval for
    // nothing — and the self-assessment would be feeding itself.
    expect(offersCardPass({ status: 'finished', pass: 'cards' }, [row()])).toBe(false);
  });
});
