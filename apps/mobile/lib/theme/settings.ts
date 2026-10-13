// Settings presentation; controllers and permission gates remain in their sections.
import { SPACE } from './space.js';

export const SETTINGS = {
  /** A settings page's own top and bottom room (ui_kits/app/Settings.jsx: `18px 16px 26px`). */
  page: { top: 18, bottom: 26 },
  /** A form's label over its field (components/core/Field.jsx: gap 6). */
  fieldGap: 6,
  /** Fields of one form, one under the other. */
  formGap: SPACE.lg,
} as const;
