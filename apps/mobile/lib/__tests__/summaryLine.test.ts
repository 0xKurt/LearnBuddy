import { describe, expect, it } from 'vitest';

import { summaryLines, topicsToReview } from '../practice/summaryLine.js';

describe('summaryLines (user feedback #1)', () => {
  it('homework says what she solved herself, never a hit rate', () => {
    expect(summaryLines({ answered: 1, first_try: 0 }, 'help')).toEqual([
      { key: 'summary_line.help', count: 1 },
    ]);
  });

  it('never shows a zero or an "x of y"', () => {
    for (const mode of ['practice', 'test', 'help'] as const) {
      for (const [answered, firstTry] of [
        [1, 0],
        [4, 1],
        [0, 0],
      ] as const) {
        const lines = summaryLines({ answered, first_try: firstTry }, mode);
        expect(lines.every((l) => l.count === undefined || l.count > 0)).toBe(true);
        expect(lines.some((l) => l.key.includes('first') && firstTry < answered)).toBe(false);
      }
    }
  });

  it('names a round right at once, but not in a test', () => {
    expect(summaryLines({ answered: 3, first_try: 3 }, 'practice')).toEqual([
      { key: 'summary_line.answered', count: 3 },
      { key: 'summary_line.all_first' },
    ]);
    expect(summaryLines({ answered: 1, first_try: 1 }, 'practice')).toEqual([
      { key: 'summary_line.answered', count: 1 },
      { key: 'summary_line.first_one' },
    ]);
    expect(summaryLines({ answered: 3, first_try: 3 }, 'test')).toEqual([
      { key: 'summary_line.answered', count: 3 },
    ]);
  });
});

describe('topicsToReview (issue #630)', () => {
  const shaky = ['Brüche kürzen'];

  it('names nothing to look at again when every answer ended right', () => {
    // The device: "Schauen wir nochmal an" and "Die wackligen nochmal üben" after an all-right
    // round (one answer had needed a second try).
    expect(topicsToReview({ answered: 7, right: 7, shaky_topics: shaky }, 'practice')).toEqual([]);
  });

  it('names what did not end right', () => {
    expect(topicsToReview({ answered: 7, right: 6, shaky_topics: shaky }, 'practice')).toEqual(
      shaky,
    );
    // A test with one missed answer, too.
    expect(topicsToReview({ answered: 4, right: 3, shaky_topics: shaky }, 'test')).toEqual(shaky);
  });

  it('keeps what an older server said, and names no topic for homework', () => {
    expect(topicsToReview({ answered: 7, shaky_topics: shaky }, 'practice')).toEqual(shaky);
    expect(topicsToReview({ answered: 2, right: 1, shaky_topics: shaky }, 'help')).toEqual([]);
  });
});
