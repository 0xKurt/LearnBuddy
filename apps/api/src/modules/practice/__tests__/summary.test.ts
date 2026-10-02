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

  it('a tapped word shows she recognised it, not that she can write it (#163)', () => {
    // Since #147 she can tap one of four of her own words. A class test asks her to
    // produce it; four right taps must not read like four words she has.
    const tapped = summarize([
      row({ answered_by: 'tapped' }),
      row({ answered_by: 'tapped' }),
      row({ answered_by: 'tapped' }),
    ]);
    expect(tapped.answered).toBe(3);
    expect(tapped.first_try).toBe(3);
    expect(tapped.secure_topics).toEqual([]);

    // Written ones carry the topic, and a tap beside them changes nothing.
    const written = summarize([
      row({ answered_by: 'typed' }),
      row({ answered_by: 'typed' }),
      row({ answered_by: 'tapped' }),
    ]);
    expect(written.secure_topics).toEqual(['Brüche']);
  });

  it('counts an order or a match she arranged, because tapping IS that form (#228–#230)', () => {
    // The carve-out that keeps #163 honest in both directions. Tapping a vocabulary word from
    // four of her own replaces producing it, so it is weaker evidence. Putting a time line in
    // order, connecting pairs, sorting into groups: the class test asks for exactly that, with a
    // pencil instead of a finger. There is nothing weaker to weigh down.
    const boards = summarize([
      row({ kind: 'order', answered_by: 'tapped' }),
      row({ kind: 'match', answered_by: 'tapped' }),
    ]);
    expect(boards.secure_topics).toEqual(['Brüche']);
    // And a partly right table never reaches here as a fraction: it did not close the question.
    // What reaches here is the right answer after it — which cost the first try.
    const withHelp = summarize([
      row({ kind: 'table_fill', answered_by: 'typed', first_try_correct: false }),
      row({ kind: 'table_fill', answered_by: 'typed' }),
    ]);
    expect(withHelp.secure_topics).toEqual([]);
    expect(withHelp.shaky_topics).toEqual(['Brüche']);
  });

  it('counts a topic once however it is written', () => {
    const s = summarize([row({ topic: 'Brüche' }), row({ topic: ' brüche ' })]);
    expect(s.secure_topics).toEqual(['Brüche']);
  });

  it('names no topic from a free text she did not get right (#197)', () => {
    // There was no single right answer to miss, so missing it is not evidence of a gap —
    // and the app had been writing exactly that into "wacklige Themen".
    const s = summarize([
      row({ topic: 'Erörterung', kind: 'long', status: 'revealed', first_try_correct: false }),
      row({ topic: 'Erörterung', kind: 'long', status: 'skipped', first_try_correct: false }),
    ]);
    expect(s.shaky_topics).toEqual([]);
    expect(s.secure_topics).toEqual([]);
    // She wrote them, though: the count of what she worked through is not reduced.
    expect(s.answered).toBe(2);
  });

  it('counts a free text she DID get right like any other question (#197)', () => {
    const s = summarize([
      row({ topic: 'Erörterung', kind: 'long' }),
      row({ topic: 'Erörterung', kind: 'long' }),
    ]);
    expect(s.secure_topics).toEqual(['Erörterung']);
    expect(s.shaky_topics).toEqual([]);
  });

  it('still calls a missed question with one answer shaky (#197 changed nothing there)', () => {
    const s = summarize([
      row({ topic: 'Brüche', kind: 'numeric', status: 'revealed', first_try_correct: false }),
    ]);
    expect(s.shaky_topics).toEqual(['Brüche']);
  });
});
