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
  /** The most of a row the state's word may take before it wraps. */
  labelShare: '45%' as const,
  top: 28,
} as const;
