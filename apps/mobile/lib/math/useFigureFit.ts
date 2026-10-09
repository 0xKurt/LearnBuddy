// How a drawing finds its size in its frame (components/math/FigureView.tsx): it lays out at the
// frame's width, measures its natural height once, and DERIVES its scale from whatever room it is
// given right now (the rules, and why they end the card ↔ conversation loop of issue #96, are in
// figureScale.ts, where they are tested). Until it has both numbers it is `sizing`, and says so to
// whoever measures around it (`figureSizing`, issue #501).

import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';

import {
  drawnAtWidth,
  figureBodyWidth,
  figureScale,
  leastFigureScale,
  naturalFigureHeight,
  newFigureWidth,
} from './figureScale.js';
import { useReportSizing } from './figureSizing.js';

export function useFigureFit(
  figure: { type: string },
  maxHeight: number | undefined,
  /** The frame's padding and border (`FIGURE_CHROME` unless given). */
  chrome: number | undefined,
) {
  const [width, setWidth] = useState(0);
  // The drawing's full height at this width, measured once.
  const [fullHeight, setFullHeight] = useState(0);
  const sizing = width === 0 || fullHeight === 0;
  useReportSizing(sizing ? null : fullHeight);
  const drawn = useRef<View>(null);
  /** The frame's width, taken the moment it is laid out: a measurement at another is stale. */
  const frame = useRef(0);
  /**
   * The drawing's natural height, from a box `w` × `h` measured at scale 1 — only at the frame's
   * current width, and only the first one (issue #501). A layout event for the box at the frame's
   * PREVIOUS width arrives after the new width was taken: kept, it gave the drawing a natural
   * height for another width.
   */
  const natural = (w: number, h: number) => {
    if (!drawnAtWidth(frame.current, w, chrome)) return;
    setFullHeight((now) => (now > 0 ? now : (naturalFigureHeight(0, h) ?? 0)));
  };
  // The natural height is also read after a render that still lacks it (issue #501). The layout
  // event alone missed it: the drawing's box changed with the frame's width BEFORE the render at
  // scale 1, which then brought no event of its own — and the drawing kept scale 1 for good (the
  // coins at 360, never scaled, however little room the card had).
  useEffect(() => {
    if (width === 0 || fullHeight > 0) return;
    drawn.current?.measure((_x, _y, w, h) => natural(w, h));
  });
  // A chart keeps the width its labels are checked at (`leastFigureScale`, issue #501).
  const scale = figureScale(fullHeight, maxHeight, leastFigureScale(figure, width, chrome));
  return {
    width,
    scale,
    bodyWidth: figureBodyWidth(width, scale, chrome),
    sizing,
    /** The drawing's own box, inside the frame. */
    drawn,
    /** The frame laid out: a new width means a new natural height, measured again. */
    onFrame: (e: LayoutChangeEvent) => {
      const w = newFigureWidth(width, e.nativeEvent.layout.width);
      if (w !== null) {
        frame.current = w;
        setWidth(w);
        setFullHeight(0);
      }
    },
    /** The first layout after a width change renders at scale 1: the drawing's natural height. */
    onDrawn: (e: LayoutChangeEvent) =>
      natural(e.nativeEvent.layout.width, e.nativeEvent.layout.height),
  };
}
