import { describe, expect, it } from 'vitest';

import { summaryLines } from '../practice/summaryLine.js';

describe('summaryLines (user feedback #1)', () => {
  it('homework says what she solved herself, never a hit rate', () => {
    expect(summaryLines({ answered: 1, first_try: 0 }, 'help')).toEqual([
      { key: 'summary_line.help', count: 1 },
    ]);
  });

  it('never shows a zero or an "x of y"', () => {
    for (const mode of ['practice', 'explain', 'test', 'help'] as const) {
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
    expect(summaryLines({ answered: 1, first_try: 1 }, 'explain')).toEqual([
      { key: 'summary_line.answered', count: 1 },
      { key: 'summary_line.first_one' },
    ]);
    expect(summaryLines({ answered: 3, first_try: 3 }, 'test')).toEqual([
      { key: 'summary_line.answered', count: 3 },
    ]);
  });
});
