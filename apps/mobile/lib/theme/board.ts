// The answer board's one state set (design components/practice/Tasks.jsx `T`, `Tile`; #599):
//
//   tile    free                      paper, 1 pt control border
//   picked  the one thing chosen now  light primary, 2 pt primary  — Option's "selected"
//   placed  answered, changeable      light primary, no ring
//   slot    an empty place            canvas, dashed
//   correct / wrong                   tinted, 2 pt success / danger — Option's own
//
// Every answer form draws its pieces through `components/lb/Tile.tsx` with these skins, and the
// colours of the four states Option has are read from Option's own look (`optionLook`), so an
// option and a tile can never drift apart.
import { UI } from './components.js';
import type { Palette } from './palettes.js';
import { optionLook, PRACTICE, type OptionState } from './practice.js';
import { CONTROL, SPACE, TOUCH } from './space.js';

export const TILE_STATES = ['tile', 'picked', 'placed', 'slot', 'correct', 'wrong'] as const;
export type TileState = (typeof TILE_STATES)[number];

/** The word pill's visible height (Tasks.jsx WordBank, Groups: 40); its target stays 44. */
const WORD = 40;
/** A gap in running text (Tasks.jsx Cloze: 36 high, at least 72 wide). */
const GAP = 36;

export const BOARD = {
  /** Between two pieces, and between two blocks of a board (Tasks.jsx: 8 and 12). */
  gap: SPACE.sm,
  blockGap: SPACE.md,
  /** A step: Option's own height, padding and badge (Tasks.jsx `Tile`). */
  step: {
    minHeight: PRACTICE.optionHeight,
    /** A side of a pair (Tasks.jsx Pairs). */
    tall: 64,
    padStart: PRACTICE.optionPaddingStart,
    padEnd: PRACTICE.optionPaddingEnd,
    padY: SPACE.sm,
    densePadY: SPACE.xs,
    gap: SPACE.md,
    badge: PRACTICE.badgeSize,
    mark: PRACTICE.badgeIcon,
  },
  /**
   * A word: a 40 pt pill on one line. What its 44 pt target reaches beyond the pill is handed
   * back as margin, so two rows stand a pill and a gap apart; a row of words pads itself by
   * `reach` above and below (`WORD_ROW`), so the first and the last target stay inside it.
   */
  word: { height: WORD, pad: 14, gap: 6, reach: (TOUCH - WORD) / 2 },
  /** A short thing in a grid place (an order of numbers): one touch target tall, centred. */
  cell: { minHeight: TOUCH, pad: SPACE.sm },
  /**
   * A row of a list she picks one from (a line of a Fehlerdetektiv, the chosen row of a choice in
   * a sheet): one touch target tall, or the regular control's height beside regular buttons.
   */
  row: { minHeight: TOUCH, tall: CONTROL.md, pad: SPACE.md },
  /** A gap of a cloze. */
  slot: { height: GAP, minWidth: 72, pad: 10 },
  /** A marked word in running text (components/practice/Answers.jsx MarkText). */
  mark: { radius: 6, underline: 2, wordPad: SPACE.xs / 2 },
  /** A group's card (Tasks.jsx Groups): the dashed ring while it can take what she holds. */
  group: { ring: UI.selectedBorder },
  /** A table (Tasks.jsx FillTable): the head's padding, a row's height, a cell's padding. */
  table: { headPadY: 10, headPadX: SPACE.sm, row: 52, cellPad: 6 },
  /** The one hint line under a board stands in by this much (ui_kits/app/Tasks.jsx `Hint`). */
  hintInset: SPACE.xs,
  dashed: PRACTICE.checkboxBorder,
} as const;

/** A row of word pills that wraps: 8 between two, and room for the targets' reach. */
export const WORD_ROW = {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: BOARD.gap,
  paddingVertical: BOARD.word.reach,
} as const;

const AS_OPTION: Partial<Record<TileState, OptionState>> = {
  tile: 'idle',
  picked: 'selected',
  correct: 'correct',
  wrong: 'wrong',
};

export type TileSkin = {
  bg: string;
  /** Text and icons on it. */
  color: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: 'solid' | 'dashed';
};

/** How a piece looks in a state. */
export function tileSkin(p: Palette, state: TileState): TileSkin {
  const option = AS_OPTION[state];
  if (option !== undefined) {
    const look = optionLook(p, option);
    return {
      bg: String(look.backgroundColor),
      color: state === 'correct' ? p.successText : state === 'wrong' ? p.danger : p.ink,
      borderColor: String(look.borderColor),
      borderWidth: Number(look.borderWidth),
      borderStyle: 'solid',
    };
  }
  if (state === 'placed') {
    return {
      bg: p.primaryLt,
      color: p.ink,
      borderColor: p.primaryLt,
      borderWidth: PRACTICE.border,
      borderStyle: 'solid',
    };
  }
  // An empty place. Its words ("leer") take the placeholder ink: ink3 is for hairlines only.
  return {
    bg: p.canvas,
    color: p.placeholder,
    borderColor: p.hairlineStrong,
    borderWidth: BOARD.dashed,
    borderStyle: 'dashed',
  };
}

/** The round badge in front of a step: canvas while free, the state's colour once it counts. */
export function tileBadge(p: Palette, state: TileState): { bg: string; color: string } {
  if (state === 'tile' || state === 'slot') return { bg: p.canvas, color: p.primaryDk };
  if (state === 'correct') return { bg: p.success, color: p.paper };
  if (state === 'wrong') return { bg: p.danger, color: p.paper };
  return { bg: p.primary, color: p.onPrimary };
}
