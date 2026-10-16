// Which forms a set of stored questions uses (F5-1, #657): read off the rows, or null when one of
// them is of a form code cannot name — then the model chooses, never quietly fewer forms.

import { describe, expect, it } from 'vitest';

import { formsOfItems, type SourceRow } from '../formSources';

const row = (over: Partial<SourceRow>): SourceRow => ({
  kind: 'short',
  figure: null,
  choice_figures: null,
  bar_task: null,
  staff_task: null,
  code_task: null,
  task_part: null,
  parts_task: null,
  read_passage: null,
  ...over,
});

describe('formsOfItems', () => {
  it('names structured kinds, the separate task lists and every figure type', () => {
    expect(
      formsOfItems([
        row({ kind: 'numeric', figure: { type: 'fraction' } }),
        row({ kind: 'order' }),
        row({ kind: 'numeric', bar_task: { a: 1 } }),
        row({ kind: 'multiple_choice', choice_figures: [{ type: 'clock' }, { type: 'clock' }] }),
        row({ kind: 'short', read_passage: { text: 'x' } }),
      ]),
    ).toEqual({ forms: ['order', 'bars', 'reading'], figures: ['fraction', 'clock'] });
  });

  it('is empty for plain questions only', () => {
    expect(formsOfItems([row({}), row({ kind: 'vocab' })])).toEqual({ forms: [], figures: [] });
  });

  it('gives no answer for a kind it does not know, or for no questions', () => {
    expect(formsOfItems([row({}), row({ kind: 'something_new' })])).toBeNull();
    expect(formsOfItems([])).toBeNull();
  });
});
