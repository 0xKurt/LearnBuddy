import type { ItemView } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import { answerForm } from '../answerForm.js';

const item = (over: Partial<ItemView>) =>
  ({
    kind: 'short',
    choices: null,
    tap_choices: null,
    surface: null,
    tap: null,
    figure: null,
    ...over,
  }) as unknown as ItemView;

describe('a board under the card (the reading text keeps its smaller box above it)', () => {
  const choice = item({ kind: 'multiple_choice', choices: ['ihr Vater', 'ein Bauer'] });

  it('is the options of a CLOSED multiple choice, which stay above "Weiter" (#521, #387)', () => {
    expect(answerForm(choice, false).board).toBe(true);
    // Open, the options are the answer slot and the text keeps its full box, as before.
    expect(answerForm(choice, true).board).toBe(false);
  });

  it('is a structured item while it is open, and nothing once it is closed', () => {
    const order = item({ kind: 'order' });
    expect(answerForm(order, true).board).toBe(true);
    expect(answerForm(order, false).board).toBe(false);
  });

  it('is never a typed answer', () => {
    expect(answerForm(item({}), true).board).toBe(false);
    expect(answerForm(item({}), false).board).toBe(false);
  });
});
