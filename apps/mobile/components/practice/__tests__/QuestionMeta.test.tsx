// The question card's meta line — its topic and where the question comes from, or the part's
// letters — is one dotted line (design components/practice/Option.jsx:30, #599) and steps aside
// while she types (#387): on 360×440 it cost the header its controls.

import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QUESTION } from '../../../lib/theme/question.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { QuestionCard } from '../Question.js';
import { QuestionCard as PresentationCard } from '../../lb/QuestionCard.js';

const seen = vi.hoisted(() => ({ window: 844, overlap: 0, visible: 844 }));
vi.mock('../../../lib/useVisibleHeight.js', () => ({ useVisibleHeight: () => seen }));

function show(visible: number): void {
  Object.assign(seen, { window: visible, visible });
  renderInApp(<QuestionCard prompt="Wie viel ist 6 · 7?" topic="Einmaleins" fromBuddy />);
}

describe('the row above the question', () => {
  it('says what it is about and where it comes from in one line while she reads', () => {
    show(844);
    expect(screen.getByText('Einmaleins · von Buddy')).toBeDefined();
    expect(screen.getByTestId('question-meta').textContent).toBe('Einmaleins · von Buddy');
  });

  it('keeps the words it had where the title already names the topic, or there is none', () => {
    Object.assign(seen, { window: 844, overlap: 0, visible: 844 });
    renderInApp(<QuestionCard prompt="Wie viel ist 6 · 7?" topic={null} fromBuddy />);
    expect(screen.getByTestId('question-meta').textContent).toBe('Frage von Buddy');
  });

  it('names only the topic of a question from her own sheet', () => {
    Object.assign(seen, { window: 844, overlap: 0, visible: 844 });
    renderInApp(<QuestionCard prompt="Wie viel ist 6 · 7?" topic="Einmaleins" />);
    expect(screen.getByTestId('question-meta').textContent).toBe('Einmaleins');
  });

  it('puts a part’s letters into the same line, the origin before them', () => {
    Object.assign(seen, { window: 844, overlap: 0, visible: 844 });
    renderInApp(
      <QuestionCard
        prompt="Wie viele sind es?"
        topic="Daten"
        fromBuddy
        stimulus={{
          passage: null,
          task_part: {
            part: 'b',
            ref: 'task',
            letters: ['a', 'b', 'c'],
            stem: 'In der 6b sind 30 Kinder.',
          },
        }}
      />,
    );
    expect(screen.getByTestId('question-meta').textContent).toBe('Frage von Buddy · a) · b) · c)');
    expect(screen.getByTestId('task-part-steps').getAttribute('aria-label')).toBe(
      'Teilaufgabe b von a, b, c',
    );
  });

  it('steps aside while she types; the question stays whole', () => {
    show(440);
    expect(screen.queryByTestId('question-meta')).toBeNull();
    expect(screen.getByText('Wie viel ist 6 · 7?')).toBeDefined();
  });
});

it('hides cosmetic metadata in closed typed feedback while keeping the whole prompt', () => {
  Object.assign(seen, { window: 844, overlap: 0, visible: 844 });
  renderInApp(
    <QuestionCard prompt="Wie viel ist 6 · 7?" topic="Einmaleins" fromBuddy compactFeedback />,
  );
  expect(screen.queryByTestId('question-meta')).toBeNull();
  expect(screen.getByText('Wie viel ist 6 · 7?')).toBeDefined();
});

it('compact hides the meta line without hiding factual extra content; snug does not', () => {
  const rendered = renderInApp(
    <PresentationCard compact meta="Origin" extra={<span>Source action</span>}>
      Whole prompt
    </PresentationCard>,
  );
  expect(screen.queryByText('Origin')).toBeNull();
  expect(screen.getByText('Source action')).toBeDefined();
  rendered.rerender(
    <PresentationCard snug meta="Origin">
      Whole prompt
    </PresentationCard>,
  );
  expect(screen.getByText('Origin')).toBeDefined();
});

it('pads the card as the design does: 20 all round, 14 × 18 once compact (Option.jsx:29)', () => {
  const rendered = renderInApp(<PresentationCard testID="card">Whole prompt</PresentationCard>);
  const pad = () => {
    const style = styleOf(screen.getByTestId('card'));
    return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
  };
  expect(QUESTION.pad).toBe(20);
  expect(pad()).toEqual(['20px', '20px', '20px', '20px']);
  rendered.rerender(
    <PresentationCard testID="card" compact>
      Whole prompt
    </PresentationCard>,
  );
  expect(pad()).toEqual(['14px', '18px', '14px', '18px']);
});
