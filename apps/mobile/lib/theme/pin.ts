// The parents' PIN page (design ui_kits/app/More.jsx `ParentPin` in its `Body`): the lead under
// the head, the pad at the bottom, and the page's own insets — and the pad itself (design
// components/core/PinPad.jsx, #599): four dots over a flat keypad whose keys lie on canvas.
import type { TextStyle } from 'react-native';

import { SPACE } from './space.js';
import { fontFace } from './type.js';

export const PIN_PAGE = {
  /** `Body`: 18 above the lead, 26 under the last control. */
  top: 18,
  bottom: 26,
  /** `Lead`: its words stand 4 in from the page's gutter. */
  leadInset: SPACE.xs,
  /** The widest a line of words gets on a wide screen. */
  textWidth: 360,
} as const;

export const PIN = {
  length: 4,
  /** A dot of the progress: 14 across, 16 apart, 1.5 of edge while it is empty. */
  dot: 14,
  dotGap: 16,
  dotEdge: 1.5,
  /** Between the dots and the keys (`--space-xl`). */
  gap: SPACE.xl,
  /** A key: 76 × 56, three to a row, 20 between two columns and 10 between two rows. */
  key: { width: 76, height: 56 },
  columns: 3,
  columnGap: 20,
  rowGap: 10,
  /** The delete sign on its transparent key. */
  deleteIcon: 24,
  /** How long the fourth dot stands before the PIN is handed on, so it is seen painted. */
  completeDelay: 80,
} as const;

/** The pad's width: three keys and the two gaps between them. */
export const PIN_PAD_WIDTH = PIN.columns * PIN.key.width + (PIN.columns - 1) * PIN.columnGap;

/**
 * A digit on its key: 600 24 in the app's face (PinPad.jsx: `600 24px/1`). Read at render time,
 * so it follows the bold-text setting. The line is 28, not 24: a line as tall as its type cuts
 * the digit's top on Android.
 */
export function pinDigit(): TextStyle {
  return { ...fontFace('600'), fontSize: 24, lineHeight: 28 };
}
