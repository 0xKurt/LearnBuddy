import { RADIUS } from './radius.js';
const ICON_TILE_SIZE = 40;
export const ICON_TILE = {
  frame: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: 20,
} as const;
