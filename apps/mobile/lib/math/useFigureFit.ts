// How a drawing finds its size in its frame (components/math/FigureView.tsx): it lays out at the
// frame's width, measures its natural height once, and DERIVES its scale from whatever room it is
// given right now (the rules, and why they end the card ↔ conversation loop of issue #96, are in
// figureScale.ts, where they are tested). Until it has both numbers it is `sizing`, and says so to
// whoever measures around it (`figureSizing`, issue #501).

import { useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, View } from 'react-native';

import {
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
  useReportSizing(sizing);
  const drawn = useRef<View>(null);
  // The natural height is also read after a render that still lacks it (issue #501). The layout
  // event alone missed it: the drawing's box changed with the frame's width BEFORE the render at
  // scale 1, which then brought no event of its own — and the drawing kept scale 1 for good (the
  // coins at 360, never scaled, however little room the card had).
  useEffect(() => {
    if (width === 0 || fullHeight > 0) return;
    drawn.current?.measure((_x, _y, _w, h) =>
      setFullHeight((now) => (now > 0 ? now : (naturalFigureHeight(0, h) ?? 0))),
    );
  }, [width, fullHeight]);
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
        setWidth(w);
        setFullHeight(0);
      }
    },
    /** The first layout after a width change renders at scale 1: the drawing's natural height. */
    onDrawn: (e: LayoutChangeEvent) => {
      const h = naturalFigureHeight(fullHeight, e.nativeEvent.layout.height);
      if (h !== null) setFullHeight(h);
    },
  };
}
