// One sheet's page ("Fragen zum Blatt", ui_kits/app/Extra.jsx `SheetQuestions`); identities,
// results and mutations remain domain data.
import { UI } from './components.js';
import { TOUCH } from './space.js';

export const MATERIAL_DETAIL = {
  bottomClearance: 32,
  choiceBadge: 24,
  /**
   * A question's ⋯ in its card: a full touch target that reaches past the label row it stands
   * in, so the row stays as tall as a chip and the sign sits on the card's edge line.
   */
  menu: {
    row: UI.chip.height,
    margin: (UI.chip.height - TOUCH) / 2,
    marginRight: (UI.iconButton.glyph - TOUCH) / 2,
  },
  /**
   * The sheet pinned under the head: one small paper page per photographed page, each with four
   * lines of "writing", and the way into practising it beside them (Extra.jsx:113–116).
   */
  pages: {
    /** The strip's own margin: 4 under the head, 12 at the sides. */
    top: 4,
    side: 12,
    width: 52,
    height: 68,
    radius: 10,
    line: 3,
    lineRadius: 2,
    /** Every second line is shorter, as writing is. */
    lines: ['100%', '70%', '100%', '70%'],
    /** A sheet may have 20 pages; more than these would push the button off the row. */
    most: 3,
  },
} as const;
