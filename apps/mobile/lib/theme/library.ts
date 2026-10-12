// Browsed library frame and legacy material metadata (#548).
import { UI } from './components.js';
import { TOUCH } from './space.js';

export const LIBRARY = {
  emptyBodyWidth: 320,
  statusGap: 2,
  materialMark: { size: TOUCH, iconSize: UI.iconButton.glyph },
} as const;
