// Gesture math shared by the sheets and the photo viewer. Worklets: they run on the UI
// thread inside pan and pinch gestures (components/lb/Sheet.tsx, components/lb/ZoomViewer.tsx).

/** Pulled at least this far down (px). */
export const CLOSE_DISTANCE = 110;
/** Or flicked down at least this fast (px/s), and moved a little. */
const CLOSE_VELOCITY = 900;

/** A pull on a sheet's top (or on an unzoomed photo) closes it: far enough down, or a flick. */
export function dismissedBySwipe(translationY: number, velocityY: number): boolean {
  'worklet';
  if (translationY >= CLOSE_DISTANCE) return true;
  return velocityY >= CLOSE_VELOCITY && translationY > 12;
}

/** The photo viewer's zoom range; a double tap goes to DOUBLE_TAP_SCALE. */
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
export const DOUBLE_TAP_SCALE = 2.5;

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

/**
 * How far content scaled by `scale` (around the centre of a box `size` wide) may be moved
 * along one axis so that no empty space shows at its edges.
 */
export function maxOffset(scale: number, size: number): number {
  'worklet';
  return Math.max(0, (size * scale - size) / 2);
}

/** A move limited to the content's edges. */
export function clampOffset(offset: number, scale: number, size: number): number {
  'worklet';
  const m = maxOffset(scale, size);
  return clamp(offset, -m, m);
}

/**
 * Zooming from `fromScale` to `toScale` around a focal point (relative to the box centre)
 * keeps the point under the fingers where it is: the new offset along one axis.
 */
export function offsetAroundFocal(
  focal: number,
  fromOffset: number,
  fromScale: number,
  toScale: number,
): number {
  'worklet';
  if (fromScale === 0) return 0;
  return focal - (focal - fromOffset) * (toScale / fromScale);
}

/**
 * Past the edge, a finger moves the content only a little (a soft rubber band) instead of
 * stopping hard; it springs back when let go.
 */
export function rubberBand(value: number, limit: number): number {
  'worklet';
  if (Math.abs(value) <= limit) return value;
  const over = Math.abs(value) - limit;
  return Math.sign(value) * (limit + over * 0.35);
}
