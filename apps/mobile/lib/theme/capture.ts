import { TYPE } from './type.js';
import { SPACE, TOUCH } from './space.js';

/** The ✕'s dark circle; the 44 pt around it is what takes the tap. */
const closeFace = 24;

function flagType() {
  // Below the scale on purpose: a flag on a small photo. One point under the 11 it had in the
  // system font: the app's own face runs wider, and "Schwer lesbar" must stand whole on 72 pt.
  return { ...TYPE.label, fontSize: 10, lineHeight: 13 };
}

// The pages above the chat's field: small squares and their 44 pt remove targets.
export const CAPTURE = {
  thumbnail: 72,
  closeFace,
  /** The 44 pt target hangs over the square's corner; its circle sits a little outside. */
  closeOffset: -((TOUCH - closeFace) / 2 + SPACE.xs),
  closeGlyph: 14,
  closeOpacity: 0.85,
  glyph: 22,
  /** Room for the squares' soft shadow at the sides; a mark close over its words. */
  shadowInset: 2,
  flagInset: 1,
  get flagType() {
    return flagType();
  },
  border: 1,
  reviewGap: SPACE.sm + SPACE.xs / 2,
} as const;
