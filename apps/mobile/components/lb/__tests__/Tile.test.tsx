// The one piece of an answer board (issue #599, design components/practice/Tasks.jsx `Tile`). What
// is held here:
//
//   · what a screen reader is told is the caller's and stays exact: a button, one of a choice (a
//     radio with `aria-checked`), one of several (a checkbox), and whether it is disabled;
//   · a piece without a tap is drawn and not read (an empty place);
//   · each state paints the design's skin, each shape has the design's measures, and a thicker
//     frame never changes a piece's size;
//   · a state is never colour alone: the badge carries the number, a judged step a sign.
//
// Where a piece ends up on the screen is a measurement and belongs to tests/web.

import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { paletteOf } from '../../../lib/theme/palettes.js';
import { renderInApp, styleOf } from '../../../testing/render.js';
import { Tile, type TileState } from '../Tile.js';

const p = paletteOf('pastell');
/** The painted box of a piece: the first box inside its target. */
const face = (el: Element) => styleOf(el.firstElementChild!);
const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
};

describe('what a screen reader is told', () => {
  it('is a button by default, named by its words, and does its job on a tap', () => {
    const tap = vi.fn();
    renderInApp(<Tile onPress={tap}>Die Keimwurzel wächst</Tile>);
    const tile = screen.getByRole('button', { name: 'Die Keimwurzel wächst' });
    expect(tile.getAttribute('aria-checked')).toBeNull();
    expect(tile.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(tile);
    expect(tap).toHaveBeenCalledOnce();
  });

  it('takes the name the caller gives it instead of its words', () => {
    renderInApp(
      <Tile onPress={() => undefined} accessibilityLabel="Hund, noch ohne Partner">
        Hund
      </Tile>,
    );
    expect(screen.getByRole('button', { name: 'Hund, noch ohne Partner' })).toBeTruthy();
  });

  it.each([true, false])('is a radio that says whether it is chosen: %s', (selected) => {
    renderInApp(
      <Tile shape="word" selected={selected} onPress={() => undefined}>
        ① Subjekt
      </Tile>,
    );
    const radio = screen.getByRole('radio', { name: '① Subjekt' });
    expect(radio.getAttribute('aria-checked')).toBe(String(selected));
  });

  it.each([true, false])('is a checkbox that says whether it is marked: %s', (checked) => {
    renderInApp(
      <Tile shape="text" checked={checked} onPress={() => undefined}>
        Hund
      </Tile>,
    );
    const box = screen.getByRole('checkbox', { name: 'Hund' });
    expect(box.getAttribute('aria-checked')).toBe(String(checked));
  });

  it('says it is disabled and takes no tap', () => {
    const tap = vi.fn();
    renderInApp(
      <Tile disabled onPress={tap}>
        Maus
      </Tile>,
    );
    const tile = screen.getByRole('button', { name: 'Maus' });
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(tile);
    expect(tap).not.toHaveBeenCalled();
  });

  it('is not read at all without a tap: an empty place is only drawn', () => {
    renderInApp(
      <Tile shape="word" state="slot" testID="place">
        leer
      </Tile>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('place').getAttribute('aria-hidden')).toBe('true');
  });
});

describe('the look of a state (Tasks.jsx `T`)', () => {
  const SKIN: Record<TileState, { bg: string; edge: string; width: string; style: string }> = {
    tile: { bg: rgb(p.paper), edge: p.hairlineStrong, width: '1px', style: 'solid' },
    picked: { bg: rgb(p.primaryLt), edge: rgb(p.primary), width: '2px', style: 'solid' },
    placed: { bg: rgb(p.primaryLt), edge: rgb(p.primaryLt), width: '1px', style: 'solid' },
    slot: { bg: rgb(p.canvas), edge: p.hairlineStrong, width: '1.5px', style: 'dashed' },
    correct: { bg: rgb(p.mint), edge: rgb(p.success), width: '2px', style: 'solid' },
    wrong: { bg: rgb(p.blush), edge: rgb(p.danger), width: '2px', style: 'solid' },
  };
  const loose = (colour: string) => colour.replace(/\s/g, '');

  it.each(Object.keys(SKIN) as TileState[])('paints %s', (state) => {
    renderInApp(
      <Tile state={state} onPress={() => undefined}>
        Schritt
      </Tile>,
    );
    const style = face(screen.getByRole('button', { name: 'Schritt' }));
    expect(style.backgroundColor).toBe(SKIN[state].bg);
    expect(loose(style.borderTopColor)).toBe(loose(SKIN[state].edge));
    expect(style.borderTopWidth).toBe(SKIN[state].width);
    expect(style.borderTopStyle).toBe(SKIN[state].style);
  });

  it('keeps a piece the same size when its frame gets thicker', () => {
    renderInApp(
      <>
        <Tile onPress={() => undefined}>frei</Tile>
        <Tile state="picked" onPress={() => undefined}>
          gewählt
        </Tile>
      </>,
    );
    const free = face(screen.getByRole('button', { name: 'frei' }));
    const picked = face(screen.getByRole('button', { name: 'gewählt' }));
    // 10 of padding and 1 of frame, or 9 and 2: the words start at the same place.
    expect([free.paddingLeft, free.borderLeftWidth]).toEqual(['10px', '1px']);
    expect([picked.paddingLeft, picked.borderLeftWidth]).toEqual(['9px', '2px']);
    expect([free.paddingRight, picked.paddingRight]).toEqual(['14px', '13px']);
  });
});

describe('the shapes', () => {
  it('makes a step as tall as an Option, with the tile’s corners, across its row', () => {
    renderInApp(<Tile onPress={() => undefined}>Schritt</Tile>);
    const tile = screen.getByRole('button', { name: 'Schritt' });
    expect(styleOf(tile).alignSelf).toBe('stretch');
    expect(face(tile).minHeight).toBe('56px');
    expect(face(tile).borderTopLeftRadius).toBe('16px');
    expect(face(tile).gap).toBe('12px');
  });

  it('makes a side of a pair at least 64 tall', () => {
    renderInApp(
      <Tile tall onPress={() => undefined}>
        Bundespräsident
      </Tile>,
    );
    expect(face(screen.getByRole('button', { name: 'Bundespräsident' })).minHeight).toBe('64px');
  });

  it('makes a row of a list one target tall across its width, its content the caller’s', () => {
    // A line of a Fehlerdetektiv, the chosen row of a choice in a sheet: what they were as a
    // button of the board (44 pt, 12 pt at the sides, the tile's corners), so moving them out of
    // `<Btn>` changed no measure.
    renderInApp(
      <>
        <Tile
          shape="row"
          grow
          selected={false}
          onPress={() => undefined}
          label={<span>x = 3</span>}
        >
          Zeile A
        </Tile>
        <Tile shape="row" state="picked" tall selected onPress={() => undefined}>
          Deutsch
        </Tile>
      </>,
    );
    const line = screen.getByRole('radio', { name: 'Zeile A' });
    expect(styleOf(line).alignSelf).toBe('stretch');
    expect(styleOf(line).flexGrow).toBe('1');
    expect(face(line).minHeight).toBe('44px');
    expect(face(line).paddingLeft).toBe('12px');
    expect(face(line).borderTopLeftRadius).toBe('16px');
    expect(line.textContent).toBe('x = 3');
    // Beside regular buttons it is as tall as they are; its thicker frame comes off the padding.
    const chosen = screen.getByRole('radio', { name: 'Deutsch' });
    expect(face(chosen).minHeight).toBe('48px');
    expect(face(chosen).paddingLeft).toBe('11px');
  });

  it('makes a word a 40 pt pill on one line whose target is still 44 pt', () => {
    renderInApp(
      <Tile shape="word" onPress={() => undefined}>
        fährt
      </Tile>,
    );
    const tile = screen.getByRole('button', { name: 'fährt' });
    expect(face(tile).height).toBe('40px');
    expect(face(tile).paddingLeft).toBe('14px');
    expect(face(tile).borderTopLeftRadius).toBe('999px');
    expect(styleOf(tile).minHeight).toBe('44px');
    // What the target reaches beyond the pill is handed back, so rows keep the pill's pitch.
    expect(styleOf(tile).marginTop).toBe('-2px');
    expect(styleOf(tile).alignSelf).toBe('flex-start');
  });

  it('sets a word of running text without a frame, filled only when it is marked', () => {
    renderInApp(
      <>
        <Tile shape="text" checked={false} onPress={() => undefined}>
          Hund
        </Tile>
        <Tile shape="text" state="picked" checked onPress={() => undefined}>
          Katze
        </Tile>
      </>,
    );
    const plain = face(screen.getByRole('checkbox', { name: 'Hund' }));
    const marked = face(screen.getByRole('checkbox', { name: 'Katze' }));
    expect(plain.borderTopWidth).toBe('0px');
    expect(plain.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(plain.minHeight).toBe('44px');
    expect(marked.borderTopWidth).toBe('0px');
    expect(marked.backgroundColor).toBe(rgb(p.primaryLt));
    expect(marked.borderTopLeftRadius).toBe('6px');
  });
});

describe('never colour alone', () => {
  it('writes a step’s number into its badge, and leaves the badge empty without a place', () => {
    renderInApp(
      <>
        <Tile state="placed" badge={2} onPress={() => undefined}>
          Wurzel
        </Tile>
        <Tile badge={null} onPress={() => undefined}>
          Blätter
        </Tile>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Wurzel' }).textContent).toBe('2Wurzel');
    expect(screen.getByRole('button', { name: 'Blätter' }).textContent).toBe('Blätter');
  });

  it.each(['correct', 'wrong'] as const)('adds a sign to a judged piece: %s', (state) => {
    renderInApp(
      <>
        <Tile state={state} onPress={() => undefined}>
          geprüft
        </Tile>
        <Tile onPress={() => undefined}>offen</Tile>
      </>,
    );
    expect(screen.getByRole('button', { name: 'geprüft' }).querySelectorAll('svg')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'offen' }).querySelectorAll('svg')).toHaveLength(0);
  });

  it('keeps a used word’s place and shows nothing in it', () => {
    renderInApp(
      <Tile shape="word" state="slot" hollow disabled onPress={() => undefined}>
        isst
      </Tile>,
    );
    const tile = screen.getByRole('button', { name: 'isst' });
    // The outline stays at full strength: the place is empty, not unavailable.
    expect(face(tile).opacity).toBe('1');
    expect(styleOf(tile.firstElementChild!.firstElementChild!).opacity).toBe('0');
  });
});
