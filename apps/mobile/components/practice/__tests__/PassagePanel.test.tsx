// Der Lesetext über der Frage (issue #233). Was hier festgehalten wird:
//
//   · der Text steht mit seinen Zeilen da, die Nummer an jeder fünften (und der ersten) Zeile, und
//     ein Screenreader hört jede Zeile mit ihrer Nummer;
//   · der Kopf ist ein Knopf, der sagt, was er tut; der Titel bleibt beim Einklappen;
//   · die Zeilen einer geschlossenen Frage sind hervorgehoben UND tragen ihre Nummer, und darunter
//     steht in Worten, wo die Antwort steht;
//   · eingeklappt bleibt eingeklappt, auch bei der nächsten Frage zum selben Text.
//
// Was diese Schicht nicht sehen kann: ob Text und Frage auf 360×740 zusammen passen und nur der
// Text scrollt. Das misst der Walkthrough (tests/web/fit.ts, `scroll-text`).

import type { PassageView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { numbered, PassagePanel } from '../PassagePanel.js';

const passage = (over: Partial<PassageView> = {}): PassageView => ({
  ref: 't1',
  title: 'Der Schulweg',
  lines: Array.from({ length: 12 }, (_, i) => `Zeile Nummer ${i + 1} des Textes.`),
  lang: 'de',
  evidence: null,
  named: null,
  ...over,
});

describe('the reading text', () => {
  it('numbers the first and every fifth line, like a schoolbook', () => {
    expect([1, 2, 4, 5, 10, 11].map(numbered)).toEqual([true, false, false, true, true, false]);
    renderInApp(<PassagePanel passage={passage()} maxHeight={200} />);
    expect(screen.getByText('Der Schulweg')).toBeDefined();
    expect(screen.getByText('Zeile Nummer 7 des Textes.')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.queryByText('7')).toBeNull();
    expect(screen.getByLabelText('Zeile 7: Zeile Nummer 7 des Textes.')).toBeDefined();
    expect(screen.getByTestId('scroll-text')).toBeDefined();
  });

  it('folds with its heading as the button, and stays folded for the next question', () => {
    const p = passage({ title: 'Die Brücke' });
    const { unmount } = renderInApp(<PassagePanel passage={p} maxHeight={200} />);
    const head = screen.getByRole('button', { name: 'Die Brücke' });
    expect(screen.getByText('Einklappen')).toBeDefined();
    fireEvent.click(head);
    expect(screen.queryByText('Zeile Nummer 1 des Textes.')).toBeNull();
    expect(screen.getByText('Text zeigen')).toBeDefined();
    // Folded, the heading still says which text it is.
    expect(screen.getByText('Die Brücke')).toBeDefined();
    unmount();
    // The next question about the same text: still folded.
    renderInApp(<PassagePanel passage={p} maxHeight={200} />);
    expect(screen.getByText('Text zeigen')).toBeDefined();
    expect(screen.queryByText('Zeile Nummer 1 des Textes.')).toBeNull();
  });

  it('a text without a heading is called a reading text', () => {
    renderInApp(<PassagePanel passage={passage({ title: null, ref: 't2' })} maxHeight={200} />);
    expect(screen.getByRole('button', { name: 'Lesetext' })).toBeDefined();
  });

  it('marks the lines an answer stands in with their numbers and in words, not only a tint', () => {
    renderInApp(
      <PassagePanel
        passage={passage({ ref: 't3', evidence: { from: 7, to: 8 } })}
        maxHeight={200}
      />,
    );
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('8')).toBeDefined();
    expect(screen.getByTestId('evidence').textContent).toBe('Antwort in den Zeilen 7–8');
  });

  it('numbers the lines a question names, and counts no empty line', () => {
    const lines = ['Erste Zeile.', '', 'Zweite Zeile.', 'Dritte Zeile.', 'Vierte Zeile.'];
    renderInApp(
      <PassagePanel
        passage={passage({ ref: 't4', lines, named: { from: 3, to: 3 } })}
        maxHeight={200}
      />,
    );
    // The paragraph break is air, not a line: "Dritte Zeile." is line 3.
    expect(screen.getByLabelText('Zeile 3: Dritte Zeile.')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.queryByText('2')).toBeNull();
  });
});
