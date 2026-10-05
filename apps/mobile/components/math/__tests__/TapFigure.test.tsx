// A figure she answers in (issue #248): her place stands in words under the figure — the signal
// that is not colour or position — and that line is the control a screen reader adjusts. On a
// number line and a coordinate system the line only says THAT she chose; the exact value is the
// screen reader's alone (issue #409). A clock
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
const map: Tappable & Figure = { type: 'map', v: 'de', hl: [] };
const cell: Tappable & Figure = { type: 'schematic', d: 'plant_cell', n: [], ask: 0 };

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

  // Issue #409: the exact value in plain sight would let her move the point until the line
  // matches the question — a text comparison instead of reading the figure. The line only says
  // that she chose; the value is for a screen reader, which cannot see the mark.
  it('on a number line or a coordinate system: that she chose, never the value', () => {
    render(plane, '(2|-1)');
    expect(screen.getByTestId('tap-words').textContent).toBe('Punkt gesetzt');
    render(line, '2.5');
    expect(screen.getAllByTestId('tap-words')[1]?.textContent).toBe('Stelle gewählt');
    expect(document.body.textContent).not.toMatch(/2,5|2 \| −1/);
  });

  it('is the one control a screen reader adjusts — and it alone names the value', () => {
    render(line, '2.5');
    const slider = screen.getByRole('slider', { name: 'Deine Stelle in der Abbildung' });
    expect(slider.getAttribute('aria-valuetext')).toBe('Stelle: 2,5');
  });

  it('names the point to a screen reader with the decimal comma and a real minus', () => {
    render(plane, '(2|-1)');
    const slider = screen.getByRole('slider', { name: 'Deine Stelle in der Abbildung' });
    expect(slider.getAttribute('aria-valuetext')).toBe('Punkt (2 | −1)');
  });

  // Issue #251: on a stumme Karte the name of the region she tapped would be the answer itself.
  it('on a map: that she chose a region; its name only for a screen reader', () => {
    render(map, '');
    expect(screen.getByTestId('tap-words').textContent).toBe('Tippe auf das Gebiet in der Karte.');
    render(map, 'Bayern');
    expect(screen.getAllByTestId('tap-words')[1]?.textContent).toBe('Gebiet gewählt');
    const sliders = screen.getAllByRole('slider', { name: 'Deine Stelle in der Abbildung' });
    expect(sliders[1]?.getAttribute('aria-valuetext')).toBe('Gebiet: Bayern');
    expect(screen.getAllByTestId('tap-words')[1]?.textContent).not.toContain('Bayern');
  });

  // Issue #252: in a picture, the name of the part she tapped would be the answer itself.
  it('in a picture: that she chose a part; its name only for a screen reader', () => {
    render(cell, '');
    expect(screen.getByTestId('tap-words').textContent).toBe(
      'Tippe auf das Teil in der Abbildung.',
    );
    render(cell, 'Zellkern');
    expect(screen.getAllByTestId('tap-words')[1]?.textContent).toBe('Teil gewählt');
    const sliders = screen.getAllByRole('slider', { name: 'Deine Stelle in der Abbildung' });
    expect(sliders[1]?.getAttribute('aria-valuetext')).toBe('Teil: Zellkern');
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
