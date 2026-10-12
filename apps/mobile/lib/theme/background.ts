/** Supplied colors.css page-glow: CSS layers, listed from front to back. */
export const BACKGROUND = {
  viewBox: '0 0 100 100',
  extent: 100,
  fade: '70%',
  layers: [
    { color: 0, cx: 0, cy: 0, rx: 90, ry: 40 },
    { color: 2, cx: 100, cy: 18, rx: 70, ry: 35 },
    { color: 1, cx: 30, cy: 100, rx: 90, ry: 45 },
  ],
} as const;
