// Zeichnen auf dem Raster (issue #249) in der Antworthülle. Was hier festgehalten wird:
//
//   · das Blatt ist EIN Tippziel mit Namen, das sagt, was gezeichnet ist; ohne Finger (Screenreader,
//     Tastatur) landet ein Punkt in der Mitte und die Pfeile schieben ihn (#275);
//   · unter dem Blatt steht in Worten, was gezeichnet ist und welcher Punkt als Nächstes kommt;
//   · „Prüfen" wartet, bis jeder Punkt steht, und schickt `parts` mit den Kreuzungen;
//   · „Zurück" nimmt den letzten Schritt zurück.
//
// Ob das Blatt samt Tastenreihe und Buddys Antwort auf 360×740 passt, misst tests/web/grid.spec.ts.

import type { GridDrawTaskView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { GridAnswer } from '../GridAnswer.js';

const POINTS: GridDrawTaskView = {
  type: 'grid_draw',
  frame: { x_min: -2, x_max: 4, y_min: -2, y_max: 4 },
  sheet: { mode: 'points', names: ['A', 'B'] },
};
const BARS: GridDrawTaskView = {
  type: 'grid_draw',
  frame: { x_min: 0, x_max: 2, y_min: 0, y_max: 4 },
  sheet: {
    mode: 'bars',
    step: 1,
    bars: [
      { id: 'b1', label: 'Apfel' },
      { id: 'b2', label: 'Birne' },
    ],
  },
};

function show(view: GridDrawTaskView, onSubmit: () => void = () => undefined) {
  renderInApp(
    <GridAnswer
      view={view}
      draftKey={`grid.${Math.random()}`}
      disabled={false}
      onSubmit={onSubmit}
    />,
  );
}

const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const words = () => screen.getByTestId('grid-words').textContent;

describe('drawing on the grid', () => {
  it('says how to start, then what is drawn and which point comes next', () => {
    show(POINTS);
    expect(words()).toBe('Tippe auf die Kreuzung, wo der Punkt hingehört.');
    press(/^Koordinatensystem/);
    expect(words()).toBe('A(1|1) · als Nächstes B');
    // The paper's name for a screen reader says the same.
    expect(screen.getByRole('button', { name: /^Koordinatensystem: A\(1\|1\)/ })).toBeTruthy();
  });

  it('moves the point with the arrows and sends the crossings with "Prüfen"', () => {
    const onSubmit = vi.fn();
    show(POINTS, onSubmit);
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    press(/^Koordinatensystem/);
    press('Nach rechts');
    press('Nach oben');
    press('Nach oben');
    press(/^Koordinatensystem/);
    expect(words()).toBe('A(2|3) · B(1|1)');
    press('Prüfen');
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'grid_draw',
        points: [
          { x: 2, y: 3 },
          { x: 1, y: 1 },
        ],
        bars: [],
      },
      'A(2|3), B(1|1)',
    );
  });

  it('undoes the last step', () => {
    show(POINTS);
    press(/^Koordinatensystem/);
    press('Nach rechts');
    expect(words()).toBe('A(2|1) · als Nächstes B');
    press('Zurück');
    expect(words()).toBe('A(1|1) · als Nächstes B');
  });

  it('pulls bars: the chosen one grows a row, the arrows choose and pull', () => {
    const onSubmit = vi.fn();
    show(BARS, onSubmit);
    press(/^Säulendiagramm/);
    press('Höher');
    press('Säule danach');
    press('Höher');
    // A bar chart says what is drawn on the paper itself (its values stand in the question).
    expect(screen.queryByTestId('grid-words')).toBeNull();
    expect(screen.getByRole('button', { name: 'Säulendiagramm: Apfel 2 · Birne 1' })).toBeTruthy();
    press('Prüfen');
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'grid_draw',
        points: [],
        bars: [
          { id: 'b1', value: 2 },
          { id: 'b2', value: 1 },
        ],
      },
      'Apfel 2, Birne 1',
    );
  });
});
