// Bilder als Antwortoptionen: „Welcher Graph passt zu f(x) = x² − 1?“ (Issue #231).
//
// Was diese Schicht festhält: Die Optionen stehen als Bilder im 2×2-Raster, ein Tipp wählt
// wie bei Wörtern (Index und Text gehen an die Antwort), jede Option hat einen
// Screenreader-Text in Worten — und nirgends steht die Formel, nach der gefragt ist: weder
// sichtbar noch im Screenreader-Text. Dass vier Graphen auf 360×740 ohne Scrollen passen,
// misst der Walkthrough im Browser (tests/web/modes.spec.ts), jsdom legt nichts aus.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp, styleOf } from '../../../testing/render.js';
import { ChoiceList } from '../ChoiceList.js';

const graph = (expr: string): Figure => ({
  type: 'function_plot',
  functions: [{ expr, label: null }],
  x_min: -3,
  x_max: 3,
  y_min: -3,
  y_max: 5,
  points: [],
});

const TEXTS = ['$y = x^{2} + 1$', '$y = -x^{2} + 1$', '$y = x^{2} - 1$', '$y = (x - 1)^{2}$'];
const FIGURES = ['x^2+1', '-x^2+1', 'x^2-1', '(x-1)^2'].map(graph);

function show(tried: ReadonlySet<string> = new Set(), onChoose = vi.fn()) {
  renderInApp(
    <ChoiceList
      choices={TEXTS}
      figures={FIGURES}
      tried={tried}
      disabled={false}
      onChoose={onChoose}
    />,
  );
  return onChoose;
}

describe('Bilder als Antwortoptionen', () => {
  it('nennt jede Option mit Buchstabe und Bild in Worten, durch Punkte statt Formel', () => {
    show();
    // x² − 1 zwischen −3 und 3, im Fenster y von −3 bis 5: fünf ganzzahlige Punkte, verteilt.
    expect(
      screen.getByRole('button', {
        name: 'C: Graph durch (−2 | 3), (−1 | 0), (0 | −1), (1 | 0), (2 | 3)',
      }),
    ).toBeTruthy();
    // Vier Optionen, vier Knöpfe: kein eigener Knopf zum Vergrößern (Gedrückthalten öffnet
    // das Bild groß, ein Tipp antwortet — #224 „Minimalismus“).
    expect(screen.getAllByRole('button')).toHaveLength(4);
    for (const name of ['A', 'B', 'C', 'D']) {
      expect(
        screen.getByRole('button', { name: new RegExp(`^${name}: Graph durch`) }),
      ).toBeTruthy();
    }
  });

  it('zeigt und sagt die Formel nirgends: sie wäre die Antwort', () => {
    const { body } = document;
    show();
    expect(body.textContent).not.toMatch(/y\s*=|x²|x\^/);
    for (const b of screen.getAllByRole('button')) {
      expect(b.getAttribute('aria-label') ?? '').not.toMatch(/y\s*=|x²|x\^|hoch/);
    }
  });

  it('wählt mit einem Tipp wie bei Wörtern: Index und Text der Option', () => {
    const onChoose = show();
    fireEvent.click(screen.getByRole('button', { name: /^C:/ }));
    expect(onChoose).toHaveBeenCalledWith(2, TEXTS[2]);
  });

  it('stellt die vier Bilder zwei mal zwei, jede Karte halb so breit', () => {
    show();
    const grid = screen.getByTestId('figure-choices');
    expect(styleOf(grid).flexDirection).toBe('row');
    expect(styleOf(grid).flexWrap).toBe('wrap');
    const card = screen.getByRole('button', { name: /^A:/ }).parentElement!;
    expect(styleOf(card).flexBasis).toBe('45%');
  });

  it('lässt eine schon probierte Option sichtbar, aber nicht mehr wählbar, mit Wort statt nur Farbe', () => {
    const onChoose = show(new Set([TEXTS[0]!]));
    const a = screen.getByRole('button', { name: /^A:/ });
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Schon ausprobiert')).toBeTruthy();
    // The words stand where the letter stood; the other options keep their letters.
    expect(screen.queryAllByTestId('choice-letter').map((m) => m.textContent)).toEqual([
      'B',
      'C',
      'D',
    ]);
    fireEvent.click(a);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('bleiben nach dem Antworten stehen: ihre Wahl und die Lösung in Worten, keine Buchstaben (#521)', () => {
    renderInApp(
      <ChoiceList
        choices={TEXTS}
        figures={FIGURES}
        tried={new Set([TEXTS[0]!])}
        settled={['mine_wrong', null, 'right', null]}
        disabled={false}
      />,
    );
    expect(screen.getByTestId('figure-choices')).toBeTruthy();
    expect(screen.getByText('Deine Wahl')).toBeTruthy();
    expect(screen.getByText('Lösung')).toBeTruthy();
    // Nothing to choose any more: no letters, no tile to tap.
    expect(screen.queryAllByTestId('choice-letter')).toEqual([]);
    for (const tile of screen.getAllByRole('button'))
      expect(tile.getAttribute('aria-disabled')).toBe('true');
  });

  it('bleibt bei Texten, wenn nicht jede Option ein Bild hat', () => {
    renderInApp(
      <ChoiceList
        choices={['2/3', '3/5']}
        figures={[graph('x')]}
        tried={new Set()}
        disabled={false}
        onChoose={() => {}}
      />,
    );
    expect(screen.queryByTestId('figure-choices')).toBeNull();
    expect(screen.getByRole('button', { name: '2/3' })).toBeTruthy();
  });
});
