// The grade-10 probe's judge tooling (issues #297, #298): swapped criteria order, agreement, and
// which cases a human checks — no model.

import { describe, expect, it } from 'vitest';

import { EXPLAIN_CRITERIA } from '../cases.js';
import { agreement, forHumans, tally, verdictSchema } from '../judge.js';

const yes = { correct: true, followable: true, on_curriculum: true, short_enough: true, why: 'ok' };

describe('the grade-10 judge', () => {
  it('asks the same criteria in swapped order', () => {
    const asListed = Object.keys(verdictSchema(EXPLAIN_CRITERIA, false).shape);
    const swapped = Object.keys(verdictSchema(EXPLAIN_CRITERIA, true).shape);
    expect(asListed.slice(0, -1)).toEqual(Object.keys(EXPLAIN_CRITERIA));
    expect(swapped.slice(0, -1)).toEqual(Object.keys(EXPLAIN_CRITERIA).reverse());
    expect(asListed.at(-1)).toBe('why');
    expect(verdictSchema(EXPLAIN_CRITERIA, true).safeParse(yes).success).toBe(true);
  });

  it('counts only what both readings say; a difference goes to a human', () => {
    const same = agreement(EXPLAIN_CRITERIA, yes, yes);
    expect(same).toMatchObject({ disputed: [], clean: true });
    const split = agreement(EXPLAIN_CRITERIA, yes, { ...yes, correct: false });
    expect(split.agreed.correct).toBeNull();
    expect(split.disputed).toEqual(['correct']);
    expect(split.clean).toBe(false);
    const bothNo = agreement(
      EXPLAIN_CRITERIA,
      { ...yes, short_enough: false },
      {
        ...yes,
        short_enough: false,
      },
    );
    expect(bothNo).toMatchObject({ disputed: [], clean: false });
    expect(bothNo.agreed.short_enough).toBe(false);
  });

  it('sends every disputed case and every third of the rest to a human', () => {
    const clean = agreement(EXPLAIN_CRITERIA, yes, yes);
    const disputed = agreement(EXPLAIN_CRITERIA, yes, { ...yes, followable: false });
    const cases = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({
      id,
      agreement: id === 'b' ? disputed : clean,
    }));
    expect(forHumans(cases)).toEqual(['b', 'd', 'g']);
    expect(
      tally(
        EXPLAIN_CRITERIA,
        cases.map((c) => c.agreement),
      )[1],
    ).toEqual({
      key: 'followable',
      yes: 6,
      disputed: 1,
      of: 7,
    });
  });
});
