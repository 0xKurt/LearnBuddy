// A question's drawing is drawn again only when it or its room changes (#713, #637). In a fill-in
// sentence her answer stands in the gap while she types, so the question card renders with every
// key; the drawing in it (and a labelled picture under it) rendered and measured itself again each
// time, though nothing of it had changed. The card's own text still follows every key.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { act, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { QuestionCard } from '../Question.js';

const drawn = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../math/ZoomableFigure.js', () => ({
  ZoomableFigure: () => {
    drawn.count += 1;
    return <div data-testid="drawing" />;
  },
}));

const drawing: Figure = { type: 'fraction', shape: 'bar', fractions: [{ parts: 4, filled: 1 }] };
const picture: Figure = { type: 'schematic', d: 'bicycle', n: ['saddle', 'bell'], ask: 1 };

function typing(figure: Figure) {
  let type: (text: string) => void = () => undefined;
  function Host() {
    const [answer, setAnswer] = useState('');
    type = setAnswer;
    return (
      <QuestionCard
        prompt="Ein ___ von vier Teilen ist gefärbt."
        topic={null}
        figure={figure}
        figureMaxHeight={104}
        answer={answer}
      />
    );
  }
  renderInApp(<Host />);
  return (text: string) => act(() => type(text));
}

describe('the drawing while she types into the gap', () => {
  it.each([
    ['a drawing in the card', drawing],
    ['a labelled picture under it', picture],
  ])('%s is drawn once over four keys', (_, figure) => {
    drawn.count = 0;
    const key = typing(figure);
    const first = drawn.count;
    for (const text of ['e', 'ei', 'ein', 'eins']) key(text);
    expect(drawn.count).toBe(first);
    // …while her answer stands in the sentence.
    expect(screen.getByTestId('question-card').textContent).toContain('eins');
  });
});
