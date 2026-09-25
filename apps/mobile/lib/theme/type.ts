// Typography: a calm sans for everything, an italic serif for the one
// headline per screen (warm, not childish).
import { Platform, type TextStyle } from 'react-native';

import { LB } from './colors.js';

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

export const TYPE = {
  display: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 30,
    lineHeight: 36,
    color: LB.ink,
    letterSpacing: -0.4,
  },
  title: { fontSize: 19, lineHeight: 25, fontWeight: '600', color: LB.ink, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 23, color: LB.ink },
  small: { fontSize: 15, lineHeight: 21, color: LB.ink2 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: LB.ink2, letterSpacing: 0.2 },
} satisfies Record<string, TextStyle>;
