// Where a labelled picture (#252) stands in its room, and where its numbers go: as in a schoolbook,
// in a column beside the drawing, each joined to its part by a leader line (`columnLabels`) — no
// number covers a part. The drawing (SchematicFigures.tsx) and a finger on it (tapLayout.ts) read
// the same frame here, so a tap means what it shows.

import { columnLabels } from '../../../../packages/shared-math/src/labelBoxes.js';
import { REGION_FRAME } from '../../../../packages/shared-math/src/regions.js';
import {
  schematic,
  schematicNumbered,
  type SchematicFig,
  type SchematicShape,
} from '../../../../packages/shared-math/src/schematics.js';
import { SPACE } from '../theme/space.js';

/** A number's circle, in pt: room for "10" at the figure's font (`FONT`, figureText.tsx). */
export const BADGE_R = 11;
/** A column's numbers stand this far in from the room's edge: their ring is drawn whole. */
const EDGE = BADGE_R + 1;
/** One number above the next in a column. */
const PITCH = 2 * BADGE_R + SPACE.xs;
/** The room a column takes beside the drawing: its numbers and the gap to the drawing. */
const COLUMN = 2 * BADGE_R + SPACE.md;

/** A number: where its leader starts (on the part) and where its circle stands. */
type SchematicBadge = { from: [number, number]; at: [number, number] };

export type SchematicLayout = {
  /** pt per unit of the frame, and where the frame's (0, 0) stands. */
  k: number;
  x0: number;
  y0: number;
  width: number;
  height: number;
  /** One per number, in the order of the numbers; empty until the drawing is loaded. */
  badges: SchematicBadge[];
};

/**
 * The picture `width` pt wide: without numbers the drawing fills the width; with them it is inset
 * by a column on each side, and the room grows when the numbers need more height than it has.
 */
export function schematicLayout(
  figure: SchematicFig,
  width: number,
  drawing: SchematicShape | null | undefined,
): SchematicLayout {
  const numbered = schematicNumbered(figure);
  const inset = numbered.length > 0 ? COLUMN : 0;
  const k = (width - 2 * inset) / REGION_FRAME;
  const drawn = schematic(figure.d).height * k;
  const rows = Math.ceil(numbered.length / 2);
  const height = Math.max(drawn, rows * PITCH);
  const y0 = (height - drawn) / 2;
  const at = numbered.map((i): [number, number] => {
    const p = drawing?.parts[i]?.at ?? [0, 0];
    return [inset + p[0] * k, y0 + p[1] * k];
  });
  const slots = drawing
    ? columnLabels(
        at.map(([x, y]) => ({ x, y })),
        { left: EDGE, right: width - EDGE, top: EDGE, bottom: height - EDGE, pitch: PITCH },
      )
    : [];
  return {
    k,
    x0: inset,
    y0,
    width,
    height,
    badges: slots.map((s, n) => ({ from: at[n]!, at: [s.x, s.y] })),
  };
}
