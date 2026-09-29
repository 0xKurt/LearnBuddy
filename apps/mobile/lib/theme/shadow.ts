// Soft, warm elevation (the design examples' floating cards and composer).
// One definition for iOS (shadow*), Android (elevation) and the web (react-native-web
// maps the shadow props to box-shadow). The cast and strength come from the active
// palette (issue #29): a dark room needs a deeper, less violet shadow.
import type { ViewStyle } from 'react-native';

import { DEFAULT_THEME, paletteOf, type Palette } from './palettes.js';

function shadows(p: Palette): Record<'soft' | 'float', ViewStyle> {
  return {
    soft: {
      shadowColor: p.shadowColor,
      shadowOpacity: p.shadowOpacity[0],
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 3,
    },
    float: {
      shadowColor: p.shadowColor,
      shadowOpacity: p.shadowOpacity[1],
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
  };
}

/** Read at render time like LB; refilled when the palette changes. */
// From the palettes alone (no import back into colors.ts: that would be a cycle at module
// init); colors.ts refills it whenever the palette changes.
export const SHADOW: Record<'soft' | 'float', ViewStyle> = shadows(paletteOf(DEFAULT_THEME));

/** Called by applyPalette only (lib/theme/colors.ts keeps the order). Patches the nested
 * objects in place, so a held `SHADOW.soft` reference sees the new palette (issue #84). */
export function applyShadows(p: Palette): void {
  const next = shadows(p);
  Object.assign(SHADOW.soft, next.soft);
  Object.assign(SHADOW.float, next.float);
}
