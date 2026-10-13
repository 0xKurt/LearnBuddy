// Zeichnen auf dem Raster (issue #249) in der Antworthülle. Was hier festgehalten wird:
//
//   · das Blatt ist EIN Tippziel mit Namen, das sagt, was gezeichnet ist; ohne Finger (Screenreader,
//     Tastatur) landet ein Punkt in der Mitte (#275);
//   · gezeichnete Pfeiltasten gibt es nicht (Owner-Regel 8, #599): unter dem Blatt stehen bei
//     Säulen „−" und „+" und überall „Zurück"; wer keinen Finger auf dem Blatt hat, schiebt mit den
//     Pfeiltasten der Tastatur oder den Aktionen des Screenreaders — in allen fünf Sprachen benannt;
//   · unter dem Blatt steht in Worten, was gezeichnet ist und welcher Punkt als Nächstes kommt;
//   · „Prüfen" wartet, bis jeder Punkt steht, und schickt `parts` mit den Kreuzungen;
//   · „Zurück" nimmt den letzten Schritt zurück.
//
// Ob das Blatt samt Tasten und Buddys Antwort auf 360×740 passt, misst tests/web/grid.spec.ts.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GridDrawTaskView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { GRID_ACTIONS, GRID_STEPS, GridAnswer } from '../GridAnswer.js';

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
/** The paper with the focus on it: a hardware keyboard's arrow key lands here. */
const arrow = (name: RegExp, key: string) =>
  fireEvent.keyDown(screen.getByRole('button', { name }), { key });
const POINTS_PAPER = /^Koordinatensystem/;
const BARS_PAPER = /^Säulendiagramm/;
const ARROW_NAMES = [
  'Nach links',
  'Nach oben',
  'Nach unten',
  'Nach rechts',
  'Säule davor',
  'Säule danach',
];
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

  it('draws no arrow keys: only "Zurück" under a paper of points (owner rule 8, #599)', () => {
    show(POINTS);
    for (const name of [...ARROW_NAMES, 'Höher', 'Niedriger'])
      expect(screen.queryByRole('button', { name })).toBeNull();
    const keys = within(screen.getByRole('toolbar', { name: 'Zeichnen' })).getAllByRole('button');
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual(['Zurück']);
  });

  it('moves the point with the arrow keys of a keyboard and sends the crossings with "Prüfen"', () => {
    const onSubmit = vi.fn();
    show(POINTS, onSubmit);
    const check = screen.getByRole('button', { name: 'Prüfen' });
    expect(check.getAttribute('aria-disabled')).toBe('true');
    press(POINTS_PAPER);
    arrow(POINTS_PAPER, 'ArrowRight');
    arrow(POINTS_PAPER, 'ArrowUp');
    arrow(POINTS_PAPER, 'ArrowUp');
    press(POINTS_PAPER);
    expect(words()).toBe('A(2|3) · B(1|1)');
    // The other two directions, and a key that is no arrow moves nothing.
    arrow(POINTS_PAPER, 'ArrowLeft');
    arrow(POINTS_PAPER, 'ArrowDown');
    arrow(POINTS_PAPER, 'a');
    expect(words()).toBe('A(2|3) · B(0|0)');
    arrow(POINTS_PAPER, 'ArrowRight');
    arrow(POINTS_PAPER, 'ArrowUp');
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

  it('moves nothing with the keyboard while the answer is being judged', () => {
    renderInApp(
      <GridAnswer view={BARS} draftKey="grid.locked" disabled onSubmit={() => undefined} />,
    );
    arrow(BARS_PAPER, 'ArrowUp');
    // Nothing is drawn: the paper still says how to start.
    expect(
      screen.getByRole('button', {
        name: 'Säulendiagramm: Tippe in eine Spalte – so hoch wird die Säule.',
      }),
    ).toBeTruthy();
  });

  it('undoes the last step', () => {
    show(POINTS);
    press(POINTS_PAPER);
    arrow(POINTS_PAPER, 'ArrowRight');
    expect(words()).toBe('A(2|1) · als Nächstes B');
    press('Zurück');
    expect(words()).toBe('A(1|1) · als Nächstes B');
  });

  it('pulls bars: − and + pull the chosen one a row, the keyboard chooses another', () => {
    const onSubmit = vi.fn();
    show(BARS, onSubmit);
    for (const name of ARROW_NAMES) expect(screen.queryByRole('button', { name })).toBeNull();
    const keys = within(screen.getByRole('toolbar', { name: 'Zeichnen' })).getAllByRole('button');
    expect(keys.map((k) => k.getAttribute('aria-label'))).toEqual(['Niedriger', 'Höher', 'Zurück']);
    press(BARS_PAPER);
    press('Höher');
    press('Höher');
    press('Niedriger');
    arrow(BARS_PAPER, 'ArrowRight');
    arrow(BARS_PAPER, 'ArrowUp');
    arrow(BARS_PAPER, 'ArrowUp');
    arrow(BARS_PAPER, 'ArrowDown');
    arrow(BARS_PAPER, 'ArrowLeft');
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

  it('gives a screen reader every step as an action on the paper, named in five languages', () => {
    // react-native-web puts no accessibility actions into the DOM: what is held here is that each
    // action has a step, that the two kinds of paper offer all four of theirs, and that every
    // language names them and tells of the way in the paper's hint.
    expect(GRID_ACTIONS.points.map(([name]) => GRID_STEPS[name])).toEqual([
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 0],
    ]);
    expect(GRID_ACTIONS.bars.map(([name]) => GRID_STEPS[name])).toEqual([
      [0, 1],
      [0, -1],
      [-1, 0],
      [1, 0],
    ]);
    const HINT = { de: /Aktionen/, en: /actions/, fr: /actions/, es: /acciones/, it: /azioni/ };
    for (const [lang, actions] of Object.entries(HINT)) {
      const grid = (
        JSON.parse(
          readFileSync(join(__dirname, `../../../locales/${lang}/practice.json`), 'utf8'),
        ) as { grid: Record<string, string> }
      ).grid;
      for (const [, word] of [...GRID_ACTIONS.points, ...GRID_ACTIONS.bars])
        expect(grid[word], `${lang} grid.${word}`).toBeTruthy();
      expect(grid.tap_hint, lang).toMatch(actions);
      expect(grid.tap_hint_bars, lang).toMatch(actions);
    }
  });
});
