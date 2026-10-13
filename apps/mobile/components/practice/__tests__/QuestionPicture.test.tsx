// A labelled picture that is an image stands under the question as a card of its own, at card
// width (#599 correction; design ui_kits/app task-label): inside the question card it was held to
// the drawings' 14 % cap — 104 pt high on 360×740, its numbers 9 pt, unreadable. Its height comes
// from the room, as the picture she taps (`boardCap`). A drawing from data stays in the card.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { QuestionCard } from '../Question.js';

const seen = vi.hoisted(() => ({ window: 740, overlap: 0, visible: 740 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));

const picture: Figure = { type: 'schematic', d: 'bicycle', n: ['saddle', 'bell'], ask: 1 };
const drawing: Figure = { type: 'fraction', shape: 'bar', fractions: [{ parts: 4, filled: 1 }] };

function show(figure: Figure, visible = 740, compactFeedback = false): void {
  Object.assign(seen, { window: visible, visible });
  renderInApp(
    <QuestionCard
      prompt="Wie heißt Teil 1?"
      topic={null}
      figure={figure}
      figureMaxHeight={104}
      compactFeedback={compactFeedback}
    />,
  );
}

describe('a labelled picture next to its question', () => {
  it('stands under the question card, not in it', () => {
    show(picture);
    const card = screen.getByTestId('question-card');
    const figure = screen.getByTestId('question-figure');
    expect(card.contains(figure)).toBe(false);
    expect(screen.getByTestId('question-picture').contains(figure)).toBe(true);
    expect(card.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a drawing from data stays in the card', () => {
    show(drawing);
    expect(
      screen.getByTestId('question-card').contains(screen.getByTestId('question-figure')),
    ).toBe(true);
    expect(screen.queryByTestId('question-picture')).toBeNull();
  });

  it('folds to one line while she types', () => {
    show(picture, 440);
    expect(
      screen.getByTestId('question-picture').contains(screen.getByTestId('figure-folded')),
    ).toBe(true);
  });

  it('is not drawn under a question that stepped back to its closed line', () => {
    show(picture, 740, true);
    expect(screen.queryByTestId('question-picture')).toBeNull();
  });
});
