// Typography: one clean sans for everything; the one headline per screen is
// large and bold (the "Pastell Soft" look: friendly, not childish).
import type { TextStyle } from 'react-native';

import { LB } from './colors.js';

export const TYPE = {
  display: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    color: LB.ink,
    letterSpacing: -0.6,
  },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', color: LB.ink, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, color: LB.ink },
  small: { fontSize: 15, lineHeight: 21, color: LB.ink2 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: LB.ink2, letterSpacing: 0.2 },
} satisfies Record<string, TextStyle>;
