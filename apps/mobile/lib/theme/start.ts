import { RADIUS } from './radius.js';
import { SPACE } from './space.js';
const CHOICE_HEIGHT = 64;
export const START = {
  listGap: SPACE.sm,
  textGap: 2,
  rows: { normal: 2, vocabulary: 4 },
  choice: {
    height: CHOICE_HEIGHT,
    frame: {
      minHeight: CHOICE_HEIGHT,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: SPACE.md,
    },
    chevron: 18,
  },
  status: { mark: 20 },
} as const;
