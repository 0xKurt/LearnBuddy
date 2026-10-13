import { SPACE, TOUCH } from './space.js';
import { UI } from './components.js';
export const VOICE_PICKER = {
  basis: '30%' as const,
  // Two independent touch targets one under the other, the tile's padding and the selected frame.
  // Nothing between the two: each is a whole 44 pt target with its glyph in the middle, so they
  // stand apart already — and the 4 pt once put there, twice down the page, were what pushed the
  // French voice step past a 360×740 phone (#599, CLAUDE.md rule 16).
  get optionHeight() {
    return this.target * 2 + this.optionPadding * 2 + UI.selectedBorder * 2;
  },
  optionPadding: SPACE.xs,
  target: TOUCH,
  gap: SPACE.sm,
  descriptionGap: SPACE.xs,
  labelPadding: 0,
} as const;
