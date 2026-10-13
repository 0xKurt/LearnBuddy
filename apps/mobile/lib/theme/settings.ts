// Settings presentation; controllers and permission gates remain in their sections.
import { SPACE, TOUCH } from './space.js';

export const SETTINGS = {
  /** A settings page's own top and bottom room (ui_kits/app/Settings.jsx: `18px 16px 26px`). */
  page: { top: 18, bottom: 26 },
  /** The switch at a row's end (ui_kits/app/Flows.jsx `Toggle`): a 52×32 track, a 26 knob. */
  toggle: { width: 52, height: 32, pad: 3, knob: 26 },
  /**
   * The seven day tiles (Flows.jsx `Times`): 44 high, 6 apart. Each target stays 44 wide on a
   * 360 pt phone by reaching `bleed` into the row's side padding; the tile drawn inside it keeps
   * `inset` on either side, so two tiles stand 6 apart.
   */
  day: { height: TOUCH, inset: 3, bleed: 6 },
  /** A form's label over its field (components/core/Field.jsx: gap 6). */
  fieldGap: 6,
  /** Fields of one form, one under the other. */
  formGap: SPACE.lg,
} as const;
