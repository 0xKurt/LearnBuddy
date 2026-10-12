// The question card's first row — where the question comes from, its topic or the part's letters —
// steps aside while she types (#387): on 360×440 it cost the header its controls.

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { QuestionCard } from '../Question.js';
import { QuestionCard as PresentationCard } from '../../lb/QuestionCard.js';

const seen = vi.hoisted(() => ({ window: 844, overlap: 0, visible: 844 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));

function show(visible: number): void {
  Object.assign(seen, { window: visible, visible });
  renderInApp(<QuestionCard prompt="Wie viel ist 6 · 7?" topic="Einmaleins" fromBuddy />);
}

describe('the row above the question', () => {
  it('says where the question comes from while she reads', () => {
    show(844);
    expect(screen.getByText('Frage von Buddy')).toBeDefined();
    expect(screen.getByText('Einmaleins')).toBeDefined();
  });

  it('steps aside while she types; the question stays whole', () => {
    show(440);
    expect(screen.queryByText('Frage von Buddy')).toBeNull();
    expect(screen.queryByText('Einmaleins')).toBeNull();
    expect(screen.getByText('Wie viel ist 6 · 7?')).toBeDefined();
  });
});

it('hides cosmetic metadata in closed typed feedback while keeping the whole prompt', () => {
  Object.assign(seen, { window: 844, overlap: 0, visible: 844 });
  renderInApp(
    <QuestionCard prompt="Wie viel ist 6 · 7?" topic="Einmaleins" fromBuddy compactFeedback />,
  );
  expect(screen.queryByText('Frage von Buddy')).toBeNull();
  expect(screen.queryByText('Einmaleins')).toBeNull();
  expect(screen.getByText('Wie viel ist 6 · 7?')).toBeDefined();
});

it('compact hides decorative slots without hiding factual extra content; snug does not', () => {
  const rendered = renderInApp(
    <PresentationCard
      compact
      meta="Origin"
      figure={<span>Illustration</span>}
      extra={<span>Source action</span>}
    >
      Whole prompt
    </PresentationCard>,
  );
  expect(screen.queryByText('Origin')).toBeNull();
  expect(screen.queryByText('Illustration')).toBeNull();
  expect(screen.getByText('Source action')).toBeDefined();
  rendered.rerender(
    <PresentationCard snug meta="Origin" figure={<span>Illustration</span>}>
      Whole prompt
    </PresentationCard>,
  );
  expect(screen.getByText('Origin')).toBeDefined();
  expect(screen.getByText('Illustration')).toBeDefined();
});
