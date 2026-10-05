// Where a solid's drawing and its measures stand on the screen (components/math/SolidFigures.tsx):
// the scale that fits the drawing and its labels into their room and the place of every label.
// Pure, so a test can hold every label off the lines without a screen (#418).

import {
  placeLabels,
  textWidth,
  type Rect,
} from '../../../../packages/shared-math/src/labelBoxes.js';
import {
  drawingBox,
  type SolidDrawing,
  type SolidXY,
} from '../../../../packages/shared-math/src/solids.js';

/** Where a label's text stands: the middle of its baseline. */
export type SolidLabelSpot = { x: number; y: number };

export type SolidLayout = {
  /** A point of the drawing on the screen. */
  at: (p: SolidXY) => SolidXY;
  height: number;
  /** Each label's place, in the order of `labels`. */
  spots: SolidLabelSpot[];
};

/**
 * The tallest a drawing stands at its width: a share of it, so a drawing the card shrinks gets
 * narrower AND lower in step (FigureView: "its height follows its width"). A net is flat and wide
 * — a cylinder's strip with its two circles stood a third of the card wide at a fixed 160 pt
 * (#418) — so it takes the larger share; the card scales either down to the room it has.
 */
const SOLID_SHARE = 0.72;
const NET_SHARE = 0.85;
/** The paper around the drawing and its labels. */
const PAD = 4;
/** How often the scale is fitted to where the labels went: each pass only shrinks it. */
const PASSES = 5;

/** The smallest box around the drawing's strokes and the label boxes, on the screen. */
function union(points: readonly SolidXY[], boxes: readonly Rect[]) {
  const xs = [...points.map((p) => p.x), ...boxes.flatMap((b) => [b.x, b.x + b.w])];
  const ys = [...points.map((p) => p.y), ...boxes.flatMap((b) => [b.y, b.y + b.h])];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/**
 * The drawing and every one of `labels` (written as `text` gives it, at `size` px), each label
 * clear of every line and of each other (`placeLabels`), scaled as large as they fit together
 * into `width` and the height that follows from it. Labels take only the room they use: a side
 * no label stands on gives the drawing its width.
 */
export function solidLayout(
  drawing: SolidDrawing,
  labels: SolidDrawing['labels'],
  text: (v: number) => string,
  width: number,
  size: number,
): SolidLayout {
  const maxHeight = Math.round(width * (drawing.faces ? NET_SHARE : SOLID_SHARE));
  const box = drawingBox(drawing);
  const bw = Math.max(box.x1 - box.x0, 1e-6);
  const bh = Math.max(box.y1 - box.y0, 1e-6);
  const room = { w: width - 2 * PAD, h: maxHeight - 2 * PAD };
  const lay = (scale: number) => {
    const at = (p: SolidXY): SolidXY => ({
      x: (p.x - box.x0) * scale,
      y: (p.y - box.y0) * scale,
    });
    const boxes = placeLabels(
      labels.map((l) => ({
        at: at(l.at),
        dx: l.dx,
        dy: l.dy,
        w: textWidth(text(l.v), size),
        h: 0.8 * size,
        along: l.on ? ([at(l.on[0]), at(l.on[1])] as const) : undefined,
        within: l.in?.map(at),
      })),
      drawing.strokes.map((st) => st.pts.map(at)),
    );
    const all = union(
      drawing.strokes.flatMap((st) => st.pts.map(at)),
      boxes,
    );
    return { at, boxes, all };
  };
  let scale = Math.min(room.w / bw, room.h / bh);
  let laid = lay(scale);
  for (let pass = 0; pass < PASSES; pass++) {
    const fit = Math.min(
      room.w / (laid.all.x1 - laid.all.x0),
      room.h / (laid.all.y1 - laid.all.y0),
    );
    if (fit >= 1) break;
    // The labels keep their size while the drawing shrinks: aim a little under the fit.
    scale *= fit * 0.98;
    laid = lay(scale);
  }
  const { at, boxes, all } = laid;
  // Centred across, from the top: the drawing and its labels together.
  const dx = (width - (all.x1 - all.x0)) / 2 - all.x0;
  const dy = PAD - all.y0;
  return {
    at: (p) => {
      const q = at(p);
      return { x: q.x + dx, y: q.y + dy };
    },
    height: all.y1 - all.y0 + 2 * PAD,
    // The text's baseline: its box runs from the cap height (0.75 em above) to just below it.
    spots: boxes.map((b) => ({ x: b.x + b.w / 2 + dx, y: b.y + dy + 0.75 * size })),
  };
}
