// Reihenfolge (issue #228): eine Geste — der Reihe nach antippen, nochmal tippen nimmt
// zurück. Was hier festgehalten wird:
//
//   · jedes Element ist ein echter Button mit Namen, und der Name sagt den Platz in Worten
//     („…, Platz 2") — die Farbe ist nie das einzige Signal;
//   · ein Tipp auf ein nummeriertes Element nimmt es zurück, und alles danach gleich mit;
//   · „Prüfen" wartet, bis alle einen Platz haben, und schickt dann `parts` — die Ids, nie
//     den Text (geprüft wird auf dem Server).
//
// Was diese Schicht nicht sehen kann: ob acht Elemente auf 360×740 passen. Das misst der
// Walkthrough (tests/web/fit.ts).

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { OrderAnswer, placedFrom, placeOrTake } from '../OrderAnswer.js';

const VIEW = {
  type: 'order' as const,
  elements: [
    { id: 'a', text: 'Keimwurzel wächst' },
    { id: 'b', text: 'Samen quillt' },
    { id: 'c', text: 'Laubblätter' },
  ],
};

describe('placing and taking back', () => {
  it('gives the next place, and takes a placed one back with everything after it', () => {
    expect(placeOrTake([], 'b')).toEqual(['b']);
    expect(placeOrTake(['b'], 'a')).toEqual(['b', 'a']);
    expect(placeOrTake(['b', 'a', 'c'], 'a')).toEqual(['b']);
    expect(placeOrTake(['b', 'a', 'c'], 'b')).toEqual([]);
    expect(placeOrTake(['b', 'a', 'c'], 'c')).toEqual(['b', 'a']);
  });

  it('reads a kept arrangement back, and nothing that is not one', () => {
    const ids = new Set(['a', 'b', 'c']);
    expect(placedFrom('["b","a"]', ids)).toEqual(['b', 'a']);
    expect(placedFrom('', ids)).toEqual([]);
    expect(placedFrom('kaputt', ids)).toEqual([]);
    expect(placedFrom('{"a":1}', ids)).toEqual([]);
    expect(placedFrom('["b","x","b",3]', ids)).toEqual(['b']);
  });
});

describe('an order she taps', () => {
  it('names every element and its place in words', () => {
    renderInApp(
      <OrderAnswer view={VIEW} draftKey="t1" disabled={false} onSubmit={() => undefined} />,
    );
    expect(screen.getByRole('button', { name: 'Samen quillt, noch ohne Platz' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Samen quillt, noch ohne Platz' }));
    expect(screen.getByRole('button', { name: 'Samen quillt, Platz 1' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Laubblätter, noch ohne Platz' }));
    expect(screen.getByRole('button', { name: 'Laubblätter, Platz 2' })).toBeDefined();
    // The number is on screen too, not only in the name.
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('waits with "Prüfen" until every element has a place, then sends the ids', () => {
    const onSubmit = vi.fn();
    renderInApp(<OrderAnswer view={VIEW} draftKey="t2" disabled={false} onSubmit={onSubmit} />);
    const check = () => screen.getByRole('button', { name: 'Prüfen' });
    expect(check().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Samen quillt, noch ohne Platz' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keimwurzel wächst, noch ohne Platz' }));
    // Changed her mind: tapping the first one again takes both back.
    fireEvent.click(screen.getByRole('button', { name: 'Samen quillt, Platz 1' }));
    expect(
      screen.getByRole('button', { name: 'Keimwurzel wächst, noch ohne Platz' }),
    ).toBeDefined();
    for (const name of ['Samen quillt', 'Keimwurzel wächst', 'Laubblätter']) {
      fireEvent.click(screen.getByRole('button', { name: `${name}, noch ohne Platz` }));
    }
    expect(check().getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(check());
    expect(onSubmit).toHaveBeenCalledWith(
      { type: 'order', order: ['b', 'a', 'c'] },
      'Samen quillt → Keimwurzel wächst → Laubblätter',
    );
  });
});
