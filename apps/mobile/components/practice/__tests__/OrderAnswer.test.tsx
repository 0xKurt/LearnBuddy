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

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { isShortList, OrderAnswer, placedFrom, placeOrTake } from '../OrderAnswer.js';

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

describe('which layout an order gets', () => {
  it('puts short things (numbers) in a grid and steps in a list', () => {
    expect(isShortList(['-12', '0,5', '$\\frac{3}{4}$', '1000'])).toBe(true);
    expect(isShortList(['Samen quillt', 'Keimwurzel wächst'])).toBe(false);
  });
});

describe('numbers to order: places and a pool (#286)', () => {
  const NUMBERS = {
    type: 'order' as const,
    elements: [
      { id: 'a', text: '1000' },
      { id: 'b', text: '-12' },
      { id: 'c', text: '0,5' },
      { id: 'd', text: '17' },
    ],
  };

  it('numbers the places above them, never next to a value', () => {
    renderInApp(
      <OrderAnswer view={NUMBERS} draftKey="g1" disabled={false} onSubmit={() => undefined} />,
    );
    // Every place is there from the start, numbered.
    for (const n of ['1.', '2.', '3.', '4.']) expect(screen.getByText(n)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '-12, noch ohne Platz' }));
    const placed = screen.getByRole('button', { name: '-12, Platz 1' });
    // The place's number is not inside the tile: "1" beside "-12" would read as one number.
    expect(placed.textContent).toBe('-12');
    // Back to the pool with one tap.
    fireEvent.click(placed);
    expect(screen.getByRole('button', { name: '-12, noch ohne Platz' })).toBeDefined();
  });
});

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('the look of an order (design components/practice/Tasks.jsx `OrderList`, #599)', () => {
  const p = paletteOf('pastell');
  const step = (name: string) => screen.getByRole('button', { name });

  it('sets every step as a whole row of the board, as tall as an Option', () => {
    renderInApp(
      <OrderAnswer view={VIEW} draftKey="look1" disabled={false} onSubmit={() => undefined} />,
    );
    for (const { text } of VIEW.elements) {
      const tile = step(`${text}, noch ohne Platz`);
      expect(styleOf(tile).alignSelf, text).toBe('stretch');
      expect(styleOf(tile.firstElementChild!).minHeight, text).toBe('56px');
      expect(styleOf(tile.firstElementChild!).backgroundColor, text).toBe(rgb(p.paper));
    }
  });

  it('turns a placed step light primary without a ring, and keeps its words in ink', () => {
    renderInApp(
      <OrderAnswer view={VIEW} draftKey="look2" disabled={false} onSubmit={() => undefined} />,
    );
    fireEvent.click(step('Samen quillt, noch ohne Platz'));
    const face = styleOf(step('Samen quillt, Platz 1').firstElementChild!);
    expect(face.backgroundColor).toBe(rgb(p.primaryLt));
    expect([face.borderTopWidth, face.borderTopColor]).toEqual(['1px', rgb(p.primaryLt)]);
    // Ink, not the accent: the state is the fill and the number, never the colour of the words.
    expect(styleOf(screen.getByText('Samen quillt')).color).toBe(rgb(p.ink));
    // Still a whole row: a placed step does not shrink to its words.
    expect(styleOf(step('Samen quillt, Platz 1')).alignSelf).toBe('stretch');
  });

  it('puts its one line of how-to under the steps, until she has started', () => {
    renderInApp(
      <OrderAnswer view={VIEW} draftKey="look3" disabled={false} onSubmit={() => undefined} />,
    );
    const how = screen.getByText('Tippe sie der Reihe nach an.');
    const last = step('Laubblätter, noch ohne Platz');
    expect(last.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(last);
    expect(screen.queryByText('Tippe sie der Reihe nach an.')).toBeNull();
  });
});
