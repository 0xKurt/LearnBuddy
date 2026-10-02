// Antippen in einer Figur (#248) und Zeichnen auf Raster (#249), the way that needs no aiming:
// "Eingeben" opens steppers that set the same answer a tap sets, and "Prüfen" sends it as
// `parts`. What this layer cannot see — whether a tap at a place on the drawing lands on the
// right grid point, and whether the figure fits 360×740 — the walkthrough measures
// (tests/web/figures.spec.ts).

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { FigureTapAnswer } from '../FigureTapAnswer.js';
import { GridDrawAnswer } from '../GridDrawAnswer.js';

const GRID = { x_min: -4, x_max: 4, y_min: -3, y_max: 3, step: 1, axes: true };

describe('a point she sets without aiming', () => {
  it('waits, then sends the point set with the steppers', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <FigureTapAnswer
        view={{ type: 'figure_tap', figure: { kind: 'plane', grid: GRID, marks: [] } }}
        draftKey="tap1"
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Eingeben' }));
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: 'x größer' }));
    fireEvent.click(screen.getByRole('button', { name: 'y kleiner' }));
    // The words say it, not only the drawing.
    expect(screen.getAllByText('Dein Punkt: (2 | −1)').length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: 'Fertig' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'figure_tap', value: { kind: 'plane', x: 2, y: -1 } },
      '(2 | −1)',
    );
  });

  it('a clock: the hour and the minutes go round', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <FigureTapAnswer
        view={{ type: 'figure_tap', figure: { kind: 'clock', snap: 15 } }}
        draftKey="tap2"
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eingeben' }));
    // From 12:00, one hour back is 11, one quarter back is :45.
    fireEvent.click(screen.getByRole('button', { name: 'Stunde kleiner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Minuten kleiner' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fertig' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'figure_tap', value: { kind: 'clock', h: 11, m: 45 } },
      '11:45',
    );
  });
});

describe('a line she draws without aiming', () => {
  it('sets two points with the steppers, undoes one, and sends the drawing', () => {
    const onSubmit = vi.fn();
    renderInApp(
      <GridDrawAnswer
        view={{
          type: 'grid_draw',
          grid: GRID,
          given: { marks: [], closed: false, cells: [], mirror: null },
          tool: 'line',
          needs: 2,
          bars: [],
        }}
        draftKey="draw1"
        disabled={false}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Eingeben' }));
    fireEvent.click(screen.getByRole('button', { name: 'y kleiner' }));
    fireEvent.click(screen.getByRole('button', { name: 'Punkt setzen' }));
    // At the point now: the same button takes it away.
    expect(screen.getByRole('button', { name: 'Punkt entfernen' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'x größer' }));
    fireEvent.click(screen.getByRole('button', { name: 'y größer' }));
    fireEvent.click(screen.getByRole('button', { name: 'y größer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Punkt setzen' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fertig' })[0]!);
    expect(screen.getAllByText('Punkte: (0 | −1), (1 | 1)').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(screen.getAllByText('Punkte: (0 | −1)').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Prüfen' }).getAttribute('aria-disabled')).toBe(
      'true',
    );
    // The sheet remembers where she was (1 | 1): one step right.
    fireEvent.click(screen.getByRole('button', { name: 'Eingeben' }));
    fireEvent.click(screen.getByRole('button', { name: 'x größer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Punkt setzen' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Fertig' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onSubmit).toHaveBeenCalledWith(
      {
        type: 'grid_draw',
        points: [
          { x: 0, y: -1 },
          { x: 2, y: 1 },
        ],
        cells: [],
        bars: [],
      },
      'Punkte: (0 | −1), (2 | 1)',
    );
  });
});
