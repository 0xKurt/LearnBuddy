// A figure she answers in (issue #248): her place stands in words under the figure — the signal
// that is not colour or position — and that line is the control a screen reader adjusts. A clock
// face says where her hands stand, never the time they make (that is what she practises reading),
// and offers the choice of hand.
//
// What this layer cannot see: geometry and gestures (jsdom lays nothing out, so the drawing and
// its tap layer are not drawn). That a tap lands on its place is `lib/math/__tests__/tapLayout`;
// tapping in the real app is tests/web/tap-figures.spec.ts.

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Figure } from '@learnbuddy/shared-types/contracts';

import type { Tappable } from '../../../../../packages/shared-math/src/tap.js';
import { renderInApp } from '../../../testing/render.js';
import { TapFigure } from '../TapFigure.js';

const noop = () => undefined;
const plane: Tappable & Figure = {
  type: 'function_plot',
  functions: [],
  x_min: -4,
  x_max: 4,
  y_min: -4,
  y_max: 4,
  points: [{ x: -3, y: 2, label: 'A' }],
};
const line: Tappable & Figure = { type: 'number_line', min: 0, max: 5, step: 0.5, points: [] };
const clock: Tappable & Figure = { type: 'clock', c: [], h24: false, ask: 'none' };

function render(figure: Tappable & Figure, value: string) {
  return renderInApp(<TapFigure figure={figure} value={value} onChange={noop} disabled={false} />);
}

describe('her place in words', () => {
  it('says how to answer before her first tap', () => {
    render(plane, '');
    expect(screen.getByTestId('tap-words').textContent).toBe(
      'Tippe auf den Punkt im Koordinatensystem.',
    );
  });

  it('names the point and the place with the decimal comma and a real minus', () => {
    render(plane, '(2|-1)');
    expect(screen.getByTestId('tap-words').textContent).toBe('Punkt (2 | −1)');
  });

  it('is the one control a screen reader adjusts', () => {
    render(line, '2.5');
    const slider = screen.getByRole('slider', { name: 'Deine Stelle in der Abbildung' });
    expect(slider.getAttribute('aria-valuetext')).toBe('Stelle: 2,5');
  });

  it('on a clock: where the hands stand, never the time they make', () => {
    render(clock, '7:45');
    const words = screen.getByTestId('tap-words').textContent ?? '';
    expect(words).toContain('der kleine Zeiger zwischen 7 und 8');
    expect(words).toContain('der große Zeiger auf der 9');
    expect(words).not.toMatch(/7[:.]45/);
    // Which hand a tap moves: the small one first.
    expect(screen.getByRole('radio', { name: 'Kleiner Zeiger' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Großer Zeiger' })).toBeDefined();
  });
});
