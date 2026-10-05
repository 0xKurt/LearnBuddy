// Where each piece of a column starts, from the pieces' HEIGHTS (issue #403): the practice
// conversation shows whole pieces only (`threadRoom`), so it needs every turn's and every part's
// top. Read from positions, they went stale on the web, which reports a change of SIZE only (a
// ResizeObserver): when a reply above rewrapped at another window width, the turns under it moved
// without a new layout event, the box began at an old top, and a sliver of the orb before stood
// under the question card at 390. Heights are reported whenever they change, so the tops add up.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export type StackPiece = {
  key: string;
  /** Where it starts in the column. */
  top: number;
  /** The step above it: none above the first drawn piece, none at a piece that draws nothing. */
  step: number;
};

/**
 * The pieces `keys`, in this order, `step` apart; `onTops` hears their tops whenever one moves.
 * Each piece's `onLayout` is `onHeight(key)`.
 */
export function useStackTops(
  step: number,
  keys: readonly string[],
  onTops: ((pieces: readonly StackPiece[]) => void) | undefined,
) {
  const [heights, setHeights] = useState<Readonly<Record<string, number>>>({});
  const onHeight = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      const h = Math.round(e.nativeEvent.layout.height);
      setHeights((all) => (all[key] === h ? all : { ...all, [key]: h }));
    },
    [],
  );
  let end = 0;
  const pieces = keys.map((key) => {
    // Unmeasured counts as drawn: it then stands where it will stand.
    const height = heights[key] ?? 1;
    const gap = height > 0 && end > 0 ? step : 0;
    const top = end + gap;
    end = top + height;
    return { key, top, step: gap };
  });
  const latest = useRef({ pieces, onTops });
  latest.current = { pieces, onTops };
  const id = pieces.map((p) => `${p.key}:${p.top}`).join(',');
  useEffect(() => {
    latest.current.onTops?.(latest.current.pieces);
  }, [id]);
  return { pieces, onHeight };
}
