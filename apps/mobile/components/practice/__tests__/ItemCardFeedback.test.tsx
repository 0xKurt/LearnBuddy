// requires live verification in Claude Code session (viewport measurement is replaced)
import type { SessionItemView, SessionView } from '@learnbuddy/shared-types/contracts';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { answerForm } from '../../../lib/practice/answerForm.js';
import { questionView } from '../../../lib/practice/questionView.js';
import { renderInApp } from '../../../testing/render.js';
import { ItemCard } from '../ItemCard.js';

vi.mock('../../../lib/useVisibleHeight.js', () => ({
  useVisibleHeight: () => ({ window: 844, overlap: 0, visible: 844 }),
}));

function shown(status: SessionItemView['status'], choice = false): SessionItemView {
  return {
    item: {
      id: 'question',
      kind: choice ? 'multiple_choice' : 'numeric',
      prompt: '6 · 7',
      choices: choice ? ['41', '42'] : null,
      unit: null,
      topic: 'Einmaleins',
      origin: 'buddy',
      lang: null,
      prompt_lang: null,
      subject_kind: null,
      figure: null,
      choice_figures: null,
      image: null,
      tap_choices: null,
      surface: null,
      tap: false,
      task_view: null,
      listen: null,
      passage: null,
      task_part: null,
      tones: null,
      read_aloud: true,
    },
    status,
    attempts: status === 'open' ? 1 : 2,
    hints_used: 0,
    hints_left: 0,
    hint_available: false,
    hint_offered: false,
    reveal_available: false,
    deferred: false,
    answer: null,
    listen_transcript: null,
    explanation: null,
    why: null,
  };
}

function show(value: SessionItemView) {
  const run = { items: [value], turns: [] } as unknown as SessionView;
  const view = questionView(run, value, null);
  const form = answerForm(value.item, view.open);
  renderInApp(
    <ItemCard
      sessionId="session"
      shown={value}
      title="Übung"
      view={view}
      form={form}
      speakLive={null}
      heard={() => false}
      markHeard={() => undefined}
      disabled={false}
      minHeight={undefined}
      caps={{ figure: 180, image: 180 }}
      filling={undefined}
      readAgain={{}}
    />,
  );
  return form;
}

describe('actual question feedback classification', () => {
  it('compacts closed typed feedback even though the closed answer form is no longer typed', () => {
    const form = show(shown('correct'));
    expect(form.typed).toBe(false);
    expect(screen.queryByText('Frage von Buddy')).toBeNull();
    expect(screen.queryByText('Einmaleins')).toBeNull();
    const prompt = screen.getByRole('heading', { name: '6 · 7' });
    expect(prompt.style.fontSize).toBe('15px');
    expect(prompt.style.lineHeight).toBe('21px');
    expect(prompt.style.letterSpacing).toBe('0px');
  });
  it('keeps the original question for an open retry after a wrong attempt', () => {
    expect(show(shown('open')).typed).toBe(true);
    expect(screen.getByText('Frage von Buddy')).toBeDefined();
    expect(screen.getByText('Einmaleins')).toBeDefined();
  });
  it('keeps a closed choice question normal rather than disguising insufficient conversation room', () => {
    show(shown('correct', true));
    expect(screen.getByText('Frage von Buddy')).toBeDefined();
    expect(screen.getByText('Einmaleins')).toBeDefined();
  });
  it('retains real part context and the prompt letter in compact feedback', () => {
    const value = shown('correct');
    value.item.task_part = {
      ref: 'task',
      stem: 'Ein Rechteck ist 6 cm lang und 3 cm breit.',
      part: 'b',
      letters: ['a', 'b'],
    };
    show(value);
    expect(screen.getByText('Ein Rechteck ist 6 cm lang und 3 cm breit.')).toBeDefined();
    expect(screen.getByRole('heading', { name: 'b) 6 · 7' })).toBeDefined();
  });
});
