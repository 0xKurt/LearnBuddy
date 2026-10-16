// The question stands at the same place under the bar in every form (CLAUDE.md rule 19, #642
// item 3): on the device the cloze, order and match cards started 4 pt under the progress bar,
// their top edge against it, while a typed or choice question stood 18 pt below.
import { describe, expect, it } from 'vitest';

import { PRACTICE } from '../practice.js';

describe('the question under the progress bar', () => {
  it('starts as far below it on a board form as in the ordinary body', () => {
    expect(PRACTICE.questionColumn.paddingTop).toBe(PRACTICE.ordinaryBody.paddingTop);
  });
});
