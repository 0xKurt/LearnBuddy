import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import deAuth from '../../../locales/de/auth.json';
import { renderInApp } from '../../../testing/render.js';
import { ContactStep } from '../ContactStep.js';

it('preserves explicit yes/no and back callbacks without submitting on render', () => {
  const answer = vi.fn();
  const back = vi.fn();
  renderInApp(<ContactStep name="Mia" forChild answering={null} onAnswer={answer} onBack={back} />);
  expect(answer).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: deAuth.profile.contact_yes }));
  expect(answer).toHaveBeenLastCalledWith('yes');
  fireEvent.click(screen.getByRole('button', { name: deAuth.profile.contact_no }));
  expect(answer).toHaveBeenLastCalledWith('no');
  expect(answer).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('button', { name: deAuth.profile.back }));
  expect(back).toHaveBeenCalledTimes(1);
});

it('retains the adult wording and locks both choices while the controlled answer is saving', () => {
  const answer = vi.fn();
  renderInApp(
    <ContactStep
      name="Alex"
      forChild={false}
      answering="no"
      onAnswer={answer}
      onBack={() => undefined}
    />,
  );
  expect(screen.getByRole('heading', { name: deAuth.profile.contact_title_self })).toBeDefined();
  expect(screen.getByText(deAuth.profile.contact_body_self)).toBeDefined();
  for (const name of [deAuth.profile.contact_yes, deAuth.profile.contact_no]) {
    const button = screen.getByRole('button', { name });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
  }
  expect(answer).not.toHaveBeenCalled();
});
