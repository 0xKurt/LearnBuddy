// One board piece (issue #599, Engineering-Regel 3 "Keine Kopien"; design
// components/practice/Tasks.jsx `Tile`, implementation/MIGRATION.md §5: the board's states belong
// to Tasks, not to Btn). Read from the source, like `oneBar.test.ts`:
//
//   · `<Btn>` has the design's four variants and the three it kept from before the redesign —
//     and no state of the answer board. A board state as a button variant is how thirteen
//     variants came to stand where the design has four;
//   · the board's skin (`tileSkin`) is read by the one piece (`Tile`), by the gap of a cloze
//     (`Slot`) and by nothing else: a form never paints a state itself;
//   · the two callers that still hand a board state to `<Btn>` are listed below. The list only
//     shrinks: an entry whose file no longer needs it fails too, and when the list is empty,
//     `tile` and `picked` must be gone from Btn.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TILE_STATES } from '../theme/board.js';

const ROOT = join(__dirname, '../..');

function sources(dir: string): Array<{ file: string; text: string }> {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name)
      ? [{ file: relative(ROOT, path), text: readFileSync(path, 'utf8') }]
      : [];
  });
}

const app = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'components'))];
const BTN = 'components/lb/Btn.tsx';
const TILE = 'components/lb/Tile.tsx';
const btn = app.find((s) => s.file === BTN)!.text;

/** The names in Btn's `type Variant = …;`, as written. */
function btnVariants(): string[] {
  const body = /type Variant =([\s\S]*?);\n/.exec(btn)?.[1];
  if (body === undefined) throw new Error('type Variant not found in Btn.tsx — renamed?');
  const code = body.replace(/\/\/.*$/gm, '');
  // Only names, written out: a type handed in from elsewhere (`| BoardState`) would hide its
  // members from this test.
  if (code.replace(/'[a-z]+'|[|\s]/g, '') !== '')
    throw new Error('the Variant type of Btn must list its names as literals');
  return [...code.matchAll(/'([a-z]+)'/g)].map((m) => m[1]!);
}

/** Lines that hand a board state on as a button's variant (`variant=…`, `selectedVariant…`). */
function boardVariantLines(text: string): number {
  return text
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .filter((line) => new RegExp(`[vV]ariant[^\\n]*'(?:${TILE_STATES.join('|')})'`).test(line))
    .length;
}

/** The design's four (components/core/Btn.jsx) and the three kept from before the redesign. */
const BUTTON_VARIANTS = ['primary', 'secondary', 'quiet', 'soft', 'outline', 'ghost', 'danger'];

/**
 * Callers that still pass a board state to `<Btn>`: how many lines each has, and why. Only
 * shrinks — both belong to other changes of #599 that were open while the piece was extracted.
 */
const BOARD_LEFT: Record<string, { count: number; why: string }> = {
  'components/practice/ChoiceList.tsx': {
    count: 1,
    why: 'the lines of a Fehlerdetektiv (`tile` | `picked`): the file was with the practice-cards change of #599',
  },
  'components/lb/ChoiceOptions.tsx': {
    count: 2,
    why: 'the chosen row of a choice in a sheet (`picked`): outside the answer forms, its design form is undecided',
  },
};

describe('one board piece (#599)', () => {
  it('keeps the board states out of Btn', () => {
    const left = Object.keys(BOARD_LEFT).length > 0 ? ['tile', 'picked'] : [];
    expect(btnVariants().sort()).toEqual([...BUTTON_VARIANTS, ...left].sort());
    for (const state of ['placed', 'slot', 'correct', 'wrong'])
      expect(btnVariants(), state).not.toContain(state);
  });

  it('lets only the listed callers hand a board state to a button', () => {
    const found: Record<string, number> = {};
    for (const { file, text } of app) {
      if (file === BTN || file === TILE) continue;
      const lines = boardVariantLines(text);
      if (lines > 0) found[file] = lines;
    }
    expect(found).toEqual(
      Object.fromEntries(Object.entries(BOARD_LEFT).map(([file, { count }]) => [file, count])),
    );
  });

  it('paints a board state in one place', () => {
    expect(
      app
        .filter((s) => /\btileSkin\b/.test(s.text))
        .map((s) => s.file)
        .sort(),
    ).toEqual([BTN, 'components/lb/Slot.tsx', TILE].sort());
  });

  it('draws every piece of the answer forms with the tile', () => {
    // The forms that let her tap, place or mark a piece: each draws them through `Tile`.
    for (const form of ['OrderAnswer', 'MatchAnswer', 'MarkAnswer', 'ClozeAnswer']) {
      const text = app.find((s) => s.file === `components/practice/${form}.tsx`)!.text;
      expect(text, form).toMatch(/from '\.\.\/lb\/Tile\.js'/);
    }
  });
});
