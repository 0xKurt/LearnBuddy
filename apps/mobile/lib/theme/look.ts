import { UI } from './components.js';
import { SPACE, TOUCH } from './space.js';

export const LOOK = {
  border: UI.border,
  selectedBorder: UI.selectedBorder,
  groupGap: SPACE.sm,
  labelInset: SPACE.xs,
  settings: {
    minHeight: TOUCH,
    paddingTop: 10,
    paddingBottom: SPACE.sm,
    gap: 6,
    accent: 28,
    check: 16,
  },
  onboarding: {
    minHeight: 84,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.sm,
    gap: SPACE.sm,
    accent: 32,
    check: 18,
  },
} as const;
