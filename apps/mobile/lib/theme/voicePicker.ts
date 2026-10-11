import { SPACE, TOUCH } from './space.js';
import { UI } from './components.js';
export const VOICE_PICKER = {
  basis: '30%' as const,
  // Two independent touch targets, their gap, padding and the selected frame.
  get optionHeight() {
    return this.target * 2 + this.optionPadding * 2 + this.optionGap + UI.selectedBorder * 2;
  },
  optionPadding: SPACE.xs,
  optionGap: SPACE.xs,
  target: TOUCH,
  gap: SPACE.sm,
  descriptionGap: SPACE.xs,
  labelPadding: 0,
} as const;
