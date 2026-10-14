import { SPACE } from './space.js';
import { UI } from './components.js';

export const RESULT = {
  introGap: 10,
  staggerLimit: 5,
  legacyCardGap: 6,
  legacyCardGlyph: 18,
  row: 52,
  pad: 14,
  badge: SPACE.xl,
  glyph: 14,
  textGap: 2,
  border: UI.border,
  /** A measured word's width comes in whole points: one more, so it never breaks (`ResultList`). */
  stateSlack: 1,
  top: 28,
} as const;
