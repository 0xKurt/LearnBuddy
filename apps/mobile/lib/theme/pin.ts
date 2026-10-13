// The parents' PIN page (design ui_kits/app/More.jsx `ParentPin` in its `Body`): the lead under
// the head, the pad at the bottom, and the page's own insets.
import { SPACE } from './space.js';

export const PIN_PAGE = {
  /** `Body`: 18 above the lead, 26 under the last control. */
  top: 18,
  bottom: 26,
  /** `Lead`: its words stand 4 in from the page's gutter. */
  leadInset: SPACE.xs,
  /** The widest a line of words gets on a wide screen. */
  textWidth: 360,
} as const;
