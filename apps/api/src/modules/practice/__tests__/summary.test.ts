// What a finished practice may claim (issue #155). The external audit of 30.09.
// photographed the result screen calling four topics settled after four answers — one
// question each — and a child and a parent can read that as being ready for the test.
// CLAUDE.md rule 5: never claim what is not proven.

import { describe, expect, it } from 'vitest';

import { ENOUGH_FOR_A_TOPIC, summarize, type SummaryRow } from '../summary.js';

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  topic: 'Brüche',
  status: 'correct',
  first_try_correct: true,
  flagged_at: null,
  ...over,
});

describe('what one practice may claim', () => {
  it('names no topic on the strength of a single question', () => {
    const s = summarize([
      row({ topic: 'Brüche' }),
      row({ topic: 'Prozente' }),
      row({ topic: 'Dezimalzahlen' }),
      row({ topic: 'Terme' }),
    ]);
    // Four right answers are four right answers — they are not four topics she has.
    expect(s.secure_topics).toEqual([]);
    expect(s.answered).toBe(4);
    expect(s.first_try).toBe(4);
  });

  it('names a topic once enough of it went well at once', () => {
    const s = summarize(Array.from({ length: ENOUGH_FOR_A_TOPIC }, () => row({})));
    expect(s.secure_topics).toEqual(['Brüche']);
  });

  it('one that went badly is enough to say it still needs work', () => {
    // Saying something needs work claims less than saying it is done, so it needs less.
    const s = summarize([row({ status: 'revealed', first_try_correct: false })]);
    expect(s.shaky_topics).toEqual(['Brüche']);
    expect(s.secure_topics).toEqual([]);
  });

  it('never puts a topic in both lists', () => {
    const s = summarize([row({}), row({}), row({ status: 'correct', first_try_correct: false })]);
    expect(s.secure_topics).toEqual([]);
    expect(s.shaky_topics).toEqual(['Brüche']);
  });

  it('leaves a question she took out as not fitting out of everything', () => {
    const s = summarize([row({}), row({}), row({ flagged_at: new Date(0), status: 'skipped' })]);
    expect(s.answered).toBe(2);
    expect(s.secure_topics).toEqual(['Brüche']);
  });

  it('counts a topic once however it is written', () => {
    const s = summarize([row({ topic: 'Brüche' }), row({ topic: ' brüche ' })]);
    expect(s.secure_topics).toEqual(['Brüche']);
  });
});
