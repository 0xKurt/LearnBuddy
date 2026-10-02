// Der Lesetext über der Frage (issue #233). Was hier festgehalten wird:
//
//   · der Text steht mit seinen Zeilen da, die Nummer an jeder fünften (und der ersten) Zeile, und
//     ein Screenreader hört jede Zeile mit ihrer Nummer;
//   · „Einklappen" / „Text zeigen" ist ein Button mit Zustand (aufgeklappt oder nicht);
//   · die Zeilen einer geschlossenen Frage sind hervorgehoben UND tragen ihre Nummer.
//
// Was diese Schicht nicht sehen kann: ob Text und Frage auf 360×740 zusammen passen und nur der
// Text scrollt. Das misst der Walkthrough (tests/web/fit.ts, `scroll-text`).

import type { PassageView } from '@learnbuddy/shared-types/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { numbered, PassagePanel } from '../PassagePanel.js';

const PASSAGE: PassageView = {
  ref: 't1',
  title: 'Der Schulweg',
  lines: Array.from({ length: 12 }, (_, i) => `Zeile Nummer ${i + 1} des Textes.`),
  lang: 'de',
};

describe('the reading text', () => {
  it('numbers the first and every fifth line, like a schoolbook', () => {
    expect([1, 2, 4, 5, 10, 11].map(numbered)).toEqual([true, false, false, true, true, false]);
    renderInApp(
      <PassagePanel
        passage={PASSAGE}
        open
        onToggle={() => undefined}
        maxHeight={200}
        highlight={null}
      />,
    );
    expect(screen.getByText('Der Schulweg')).toBeDefined();
    expect(screen.getByText('Zeile Nummer 7 des Textes.')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
    expect(screen.queryByText('7')).toBeNull();
    expect(screen.getByLabelText('Zeile 7: Zeile Nummer 7 des Textes.')).toBeDefined();
  });

  it('folds and unfolds with a button that says what it does', () => {
    const onToggle = vi.fn();
    const { rerender } = renderInApp(
      <PassagePanel passage={PASSAGE} open onToggle={onToggle} maxHeight={200} highlight={null} />,
    );
    const fold = screen.getByRole('button', { name: 'Einklappen' });
    fireEvent.click(fold);
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(
      <PassagePanel
        passage={PASSAGE}
        open={false}
        onToggle={onToggle}
        maxHeight={200}
        highlight={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Text zeigen' })).toBeDefined();
    expect(screen.queryByText('Zeile Nummer 1 des Textes.')).toBeNull();
    // Folded, the title still says which text it is.
    expect(screen.getByText('Der Schulweg')).toBeDefined();
  });

  it('marks the lines an answer stands in with their numbers, not only a tint', () => {
    renderInApp(
      <PassagePanel
        passage={PASSAGE}
        open
        onToggle={() => undefined}
        maxHeight={200}
        highlight={{ from: 7, to: 8 }}
      />,
    );
    expect(screen.getByText('7')).toBeDefined();
    expect(screen.getByText('8')).toBeDefined();
  });
});
