import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderInApp } from '../../../testing/render.js';
import { Btn } from '../../lb/Btn.js';
import { AnswerFlow, AnswerShell } from '../AnswerShell.js';

it('keeps the question, options and reply in one body while the real controls remain pinned', () => {
  const next = vi.fn();
  const hint = vi.fn();
  renderInApp(
    <AnswerFlow.Provider
      value={{
        question: <div>Whole factual question</div>,
        thread: <div>Actual tutor reply</div>,
        tools: <Btn onPress={hint}>Prepared hint</Btn>,
      }}
    >
      <AnswerShell
        answer={<Btn onPress={() => undefined}>Real option</Btn>}
        action={{ next: { onPress: next } }}
      />
    </AnswerFlow.Provider>,
  );
  const body = screen.getByTestId('scroll-practice-body');
  expect(body.contains(screen.getByText('Whole factual question'))).toBe(true);
  expect(body.contains(screen.getByText('Real option'))).toBe(true);
  expect(body.contains(screen.getByText('Actual tutor reply'))).toBe(true);
  const bar = screen.getByTestId('bottom-bar');
  expect(body.contains(bar)).toBe(false);
  expect(bar.contains(screen.getByRole('button', { name: 'Prepared hint' }))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Prepared hint' }));
  fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
  expect(hint).toHaveBeenCalledOnce();
  expect(next).toHaveBeenCalledOnce();
});
