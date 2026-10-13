// The parents' PIN pad (design components/core/PinPad.jsx, #599). What is held here:
//
//   · flat keys of 76 × 56 on canvas with the tile's corners, the digit 600 24 in the app's face,
//     the delete key the `delete` sign on a transparent key — not the character "⌫";
//   · dots of 14 that fill as she types, and say how far she is;
//   · `error`: the four dots stand in the danger colour until the next key, and the pad itself
//     adds no words — the screen says and announces what happened (never colour alone);
//   · the fourth digit hands the PIN on once; a disabled pad takes nothing.

import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { PinPad } from '../PinPad.js';

const p = paletteOf('pastell');
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};
const key = (name: string) => screen.getByRole('button', { name });
const type = (digits: string) => {
  for (const d of digits) fireEvent.click(key(d));
};
const dots = (kind: 'empty' | 'filled' | 'refused') => screen.queryAllByTestId(`pin-dot-${kind}`);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the pad as the design draws it', () => {
  it('has ten flat digit keys of 76 × 56 on canvas and a transparent delete key with a sign', () => {
    renderInApp(<PinPad onComplete={() => undefined} />);
    for (const digit of '1234567890') {
      const face = styleOf(key(digit).firstElementChild!);
      expect([face.width, face.height], digit).toEqual(['76px', '56px']);
      expect(face.backgroundColor, digit).toBe(rgb(p.canvas));
      expect(face.borderTopLeftRadius, digit).toBe('16px');
      // Flat: no shadow lifts a key off the page.
      expect(face.boxShadow, digit).toBe('');
    }
    const del = key('Letzte Ziffer löschen');
    expect(styleOf(del.firstElementChild!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(del.querySelectorAll('svg')).toHaveLength(1);
    expect(del.textContent).toBe('');
    expect(screen.getAllByRole('button')).toHaveLength(11);
  });

  it('sets a digit 600 24 in the app’s face', () => {
    renderInApp(<PinPad onComplete={() => undefined} />);
    // Read as declared: the size and weight the key asks for. That the face is Figtree is held
    // where the role is defined (lib/theme/__tests__/board.test.ts, `pinDigit`) — jsdom keeps no
    // family it does not know.
    const digit = (key('7').querySelector('[dir]') as HTMLElement).style;
    expect(digit.fontSize).toBe('24px');
    expect(digit.fontWeight).toBe('600');
  });

  it('draws four dots of 14, 16 apart, empty with an edge', () => {
    renderInApp(<PinPad onComplete={() => undefined} />);
    expect(dots('empty')).toHaveLength(4);
    const dot = styleOf(dots('empty')[0]!);
    expect([dot.width, dot.height, dot.borderTopWidth]).toEqual(['14px', '14px', '1.5px']);
    expect(dot.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(styleOf(screen.getByTestId('pin-dots')).gap).toBe('16px');
  });
});

describe('entering a PIN', () => {
  it('fills a dot per digit, takes one back, and says how far she is', () => {
    renderInApp(<PinPad onComplete={() => undefined} />);
    type('12');
    expect(dots('filled')).toHaveLength(2);
    expect(styleOf(dots('filled')[0]!).backgroundColor).toBe(rgb(p.primary));
    expect(screen.getByRole('progressbar', { name: '2 von 4 Ziffern eingegeben' })).toBeTruthy();
    fireEvent.click(key('Letzte Ziffer löschen'));
    expect(dots('filled')).toHaveLength(1);
    expect(dots('empty')).toHaveLength(3);
  });

  it('hands the PIN on once with the fourth digit, after the dot was painted', () => {
    const done = vi.fn();
    renderInApp(<PinPad onComplete={done} />);
    type('1234');
    expect(dots('filled')).toHaveLength(4);
    expect(done).not.toHaveBeenCalled();
    // A fifth key changes nothing.
    type('5');
    act(() => {
      vi.runAllTimers();
    });
    expect(done).toHaveBeenCalledOnce();
    expect(done).toHaveBeenCalledWith('1234');
  });

  it('takes nothing while it is disabled, and says so', () => {
    const done = vi.fn();
    renderInApp(<PinPad onComplete={done} disabled />);
    expect(key('1').getAttribute('aria-disabled')).toBe('true');
    type('1234');
    expect(dots('filled')).toHaveLength(0);
    act(() => {
      vi.runAllTimers();
    });
    expect(done).not.toHaveBeenCalled();
  });
});

describe('a PIN that was not taken (`error`)', () => {
  it('shows the four dots in the danger colour until the next key', () => {
    renderInApp(<PinPad onComplete={() => undefined} error />);
    expect(dots('refused')).toHaveLength(4);
    expect(styleOf(dots('refused')[0]!).backgroundColor).toBe(rgb(p.danger));
    // She starts again: the dots are her new entry, in the action colour.
    type('1');
    expect(dots('refused')).toHaveLength(0);
    expect(dots('filled')).toHaveLength(1);
    expect(styleOf(dots('filled')[0]!).backgroundColor).toBe(rgb(p.primary));
    // Taken back again: the pad is simply empty — the refused entry is gone with her first key.
    fireEvent.click(key('Letzte Ziffer löschen'));
    expect(dots('refused')).toHaveLength(0);
    expect(dots('empty')).toHaveLength(4);
  });

  it('shows the next refused entry again once the pad was cleared (`resetKey`)', () => {
    const view = renderInApp(<PinPad onComplete={() => undefined} error resetKey={1} />);
    type('12');
    expect(dots('refused')).toHaveLength(0);
    view.rerender(<PinPad onComplete={() => undefined} error resetKey={2} />);
    expect(dots('refused')).toHaveLength(4);
  });

  it('claims no digits for the refused entry: the words stay the screen’s', () => {
    renderInApp(<PinPad onComplete={() => undefined} error />);
    expect(screen.getByRole('progressbar', { name: '0 von 4 Ziffern eingegeben' })).toBeTruthy();
  });

  it('shows no danger without `error`', () => {
    renderInApp(<PinPad onComplete={() => undefined} />);
    expect(dots('refused')).toHaveLength(0);
  });
});
