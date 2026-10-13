import { fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import deAuth from '../../../locales/de/auth.json';
import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
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

// The question stays a page of its own (#518) and looks like the design's page (#599,
// ui_kits/app/Onboarding.jsx:44–48): one main action, the quiet ones below it, nothing chosen.
it('asks with one main action and quiet ones below it, and nothing is answered in advance', () => {
  renderInApp(
    <ContactStep
      name="Mia"
      forChild
      answering={null}
      onAnswer={() => undefined}
      onBack={() => undefined}
    />,
  );
  const light = paletteOf('pastell');
  const swatch = document.createElement('span');
  const css = (color: string) => {
    swatch.style.backgroundColor = color;
    document.body.append(swatch);
    const value = styleOf(swatch).backgroundColor;
    swatch.remove();
    return value;
  };
  const face = (name: string) => screen.getByRole('button', { name }).firstElementChild as Element;
  const [yes, no, back] = [
    deAuth.profile.contact_yes,
    deAuth.profile.contact_no,
    deAuth.profile.back,
  ];
  expect(styleOf(face(yes)).backgroundColor).toBe(css(light.primary));
  // Not the grey bar it was: "no" carries no fill of its own.
  expect(styleOf(face(no)).backgroundColor).not.toBe(css(light.canvas));
  expect(styleOf(face(no)).backgroundColor).not.toBe(css(light.primary));
  expect(styleOf(face(no)).backgroundColor).toBe(styleOf(face(back)).backgroundColor);
  // Yes first, then no, then the way back — all three in the bar under the page.
  const order = screen.getAllByRole('button').map((button) => button.textContent);
  expect(order).toEqual([yes, no, back]);
  // An opt-in: no box, no switch, nothing that could stand ticked before an adult decides.
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('switch')).toBeNull();
  // The second step of the setup, like the pages before it — the total is not known yet.
  expect(screen.getByTestId('setup-step').textContent).toBe('Schritt 2');
});
