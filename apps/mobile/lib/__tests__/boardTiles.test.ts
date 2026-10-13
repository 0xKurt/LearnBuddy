// One board piece (issue #599, Engineering-Regel 3 "Keine Kopien"; design
// components/practice/Tasks.jsx `Tile`, implementation/MIGRATION.md §5: the board's states belong
// to Tasks, not to Btn). Read from the source, like `oneBar.test.ts`:
//
//   · `<Btn>` has the design's four variants and the two it kept from before the redesign —
//     and no state of the answer board. A board state as a button variant is how thirteen
//     variants came to stand where the design has four;
//   · the board's skin (`tileSkin`) is read by the one piece (`Tile`), by the gap of a cloze
//     (`Slot`) and by nothing else: a form never paints a state itself;
//   · nothing hands a board state on as a button's variant. The list of the last callers that
//     did (`BOARD_LEFT`) is empty and gone with `tile` and `picked` in Btn.

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

const STATE = new RegExp(`['"](?:${TILE_STATES.join('|')})['"]`);

/** What stands after `variant=` or `variant:` at `from`: a string, a `{ … }`, or up to its end. */
function valueAt(code: string, from: number): string {
  const first = code[from];
  if (first === "'" || first === '"') {
    const end = code.indexOf(first, from + 1);
    return code.slice(from, end < 0 ? code.length : end + 1);
  }
  let depth = 0;
  for (let i = from; i < code.length; i += 1) {
    const c = code[i]!;
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) {
      depth -= 1;
      // A value in braces ends with them; anything else ends where what holds it closes.
      if (depth < 0 || (depth === 0 && first === '{')) return code.slice(from, i + 1);
    } else if (depth === 0 && (c === ';' || c === ',')) return code.slice(from, i);
  }
  return code.slice(from);
}

/**
 * How often a board state is handed on as a button's variant (`variant=…`, `selectedVariant…`,
 * a type or a default of that name). Read over the whole text, not line by line: the value may
 * stand on the line after `variant={`.
 */
function boardVariants(text: string): number {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  let count = 0;
  for (const match of code.matchAll(/[vV]ariant\w*\s*\??\s*[=:]\s*/g))
    if (STATE.test(valueAt(code, match.index + match[0].length))) count += 1;
  return count;
}

/** The design's four (components/core/Btn.jsx) and the two kept from before the redesign. */
const BUTTON_VARIANTS = ['primary', 'secondary', 'quiet', 'soft', 'ghost', 'danger'];

describe('one board piece (#599)', () => {
  it('reads a variant whose value stands on the next line', () => {
    expect(boardVariants("<Btn\n  variant={\n    on ? 'picked' : 'tile'\n  }\n/>")).toBe(1);
    expect(boardVariants("<Btn\n  variant=\n    'picked'\n/>")).toBe(1);
    expect(boardVariants("<Btn variant={on ? 'picked' : 'tile'} />")).toBe(1);
    expect(boardVariants("selectedVariant = 'picked',\nselectedVariant?: 'picked' | 'x';")).toBe(2);
    expect(boardVariants("const pair = (variant: 'tile' | 'primary') => null;")).toBe(1);
    // A board state that is not a button's variant, and a variant that is no board state.
    expect(boardVariants('<Btn variant="quiet" />\n<Tile state="picked" />')).toBe(0);
    expect(boardVariants("<Btn\n  variant={quiet}\n  icon={'slot'}\n/>")).toBe(0);
    expect(boardVariants("// variant={'picked'}\n<Btn variant='quiet' />")).toBe(0);
    expect(boardVariants("<Btn variant={v} />\n<Tile state='picked' />")).toBe(0);
  });

  it('keeps the board states out of Btn', () => {
    expect(btnVariants().sort()).toEqual([...BUTTON_VARIANTS].sort());
    for (const state of TILE_STATES) expect(btnVariants(), state).not.toContain(state);
  });

  it('lets no caller hand a board state to a button', () => {
    const found: Record<string, number> = {};
    for (const { file, text } of app) {
      if (file === TILE) continue;
      const count = boardVariants(text);
      if (count > 0) found[file] = count;
    }
    expect(found).toEqual({});
  });

  it('paints a board state in one place', () => {
    expect(
      app
        .filter((s) => /\btileSkin\b/.test(s.text))
        .map((s) => s.file)
        .sort(),
    ).toEqual(['components/lb/Slot.tsx', TILE].sort());
  });

  it('draws every piece of the answer forms with the tile', () => {
    // The forms that let her tap, place or mark a piece: each draws them through `Tile`.
    for (const form of ['OrderAnswer', 'MatchAnswer', 'MarkAnswer', 'ClozeAnswer']) {
      const text = app.find((s) => s.file === `components/practice/${form}.tsx`)!.text;
      expect(text, form).toMatch(/from '\.\.\/lb\/Tile\.js'/);
    }
  });
});
