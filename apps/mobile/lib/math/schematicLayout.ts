// Where a labelled picture (#252) stands in its room, and where its numbers go: as in a schoolbook,
// in a column beside the drawing, each joined to its part by a leader line (`columnLabels`) — no
// number covers a part. The drawing (SchematicFigures.tsx) and a finger on it (tapLayout.ts) read
// the same frame here, so a tap means what it shows.

import type { FigureNames } from '../../../../packages/shared-math/src/figureNames.js';
import { columnLabels } from '../../../../packages/shared-math/src/labelBoxes.js';
import { REGION_FRAME } from '../../../../packages/shared-math/src/regions.js';
import {
  schematicBounds,
  schematicHeight,
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

/** The drawing and the names, once both are loaded (`useSchematicShapes`, `useFigureNames`). */
type SchematicLoaded = { drawing: SchematicShape; names: FigureNames };

/**
 * The picture `width` pt wide: without numbers the drawing fills the width with the whole frame, as
 * a tap needs it; with them it is cut to its bounds (`schematicBounds`, #462) and inset by a column
 * on each side, and the room grows when the numbers need more height than it has. `maxHeight`: a
 * drawing with numbers no taller than that, centred between its columns — the columns keep their
 * size, so a smaller picture is drawn smaller, not narrower (`SchematicBody`). The room is known
 * before the drawing and the names are (the parts the server numbered, `n`); where the numbers
 * stand only after.
 */
export function schematicLayout(
  figure: SchematicFig,
  width: number,
  loaded: SchematicLoaded | null,
  maxHeight = Infinity,
): SchematicLayout {
  const inset = figure.n.length > 0 ? COLUMN : 0;
  const [bx0, by0, bx1, by1] =
    inset > 0 ? schematicBounds(figure.d) : [0, 0, REGION_FRAME, schematicHeight(figure.d)];
  const free = width - 2 * inset;
  const k = Math.min(free / (bx1 - bx0), inset > 0 ? maxHeight / (by1 - by0) : Infinity);
  const drawn = (by1 - by0) * k;
  const rows = Math.ceil(figure.n.length / 2);
  const height = Math.max(drawn, rows * PITCH);
  // Where the frame's (0, 0) stands: the bounds centred between the columns and in the height.
  const x0 = inset + (free - (bx1 - bx0) * k) / 2 - bx0 * k;
  const y0 = (height - drawn) / 2 - by0 * k;
  if (!loaded) return { k, x0, y0, width, height, badges: [] };
  const at = schematicNumbered(loaded.names, figure).map((i): [number, number] => {
    const p = loaded.drawing.parts[i]?.at ?? [0, 0];
    return [x0 + p[0] * k, y0 + p[1] * k];
  });
  const slots = columnLabels(
    at.map(([x, y]) => ({ x, y })),
    { left: EDGE, right: width - EDGE, top: EDGE, bottom: height - EDGE, pitch: PITCH },
  );
  return {
    k,
    x0,
    y0,
    width,
    height,
    badges: slots.map((s, n) => ({ from: at[n]!, at: [s.x, s.y] })),
  };
}
