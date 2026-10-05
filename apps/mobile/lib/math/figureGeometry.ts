// Where a figure puts things at a given width: the number line, the bar chart and the clock face of
// components/math (the function plot's frame is `plotGeometry` in plotLayout.ts). Pure and in one
// place for two readers that must never disagree (issue #248): the drawer that paints the figure,
// and the tap layer that turns a finger's position into a place of the figure (`tapLayout.ts`). A
// copy of these numbers in each would let a tap land one place off the drawing it was aimed at.

/** The number line: its range, ticks and the screen x of a value. */
export function numberLineGeometry(
  fig: { min: number; max: number; step: number; points: ReadonlyArray<{ label: string | null }> },
  width: number,
) {
  const lo = Math.min(fig.min, fig.max);
  const hi = Math.max(fig.min, fig.max);
  const span = hi - lo || 1;
  const pad = 18;
  const x = (v: number) => pad + ((v - lo) / span) * (width - 2 * pad - 10);
  const count = Math.floor(span / fig.step + 1e-9);
  const ticks = count <= 200 ? Array.from({ length: count + 1 }, (_, i) => lo + i * fig.step) : [];
  // Every `every`-th tick carries its number: about one per 44 pt.
  const every = Math.max(1, Math.ceil(ticks.length / Math.max(2, Math.floor(width / 44))));
  // Room above the axis for the points' names.
  const axisY = fig.points.some((p) => p.label) ? 46 : 26;
  return { lo, hi, pad, x, ticks, every, axisY, height: axisY + 34 };
}

/** A rectangle in the drawing's coordinates. */
export type Box = { x: number; y: number; w: number; h: number };

/** Below this many characters per column the labels no longer fit under upright columns. */
const CHAR_W = 7;

/**
 * The bar chart: upright columns, or rows when there are many or their labels are long. `slot` is
 * the band each bar owns — the column's full height, the row's full width — which is what a tap on
 * that bar may hit.
 */
export function barChartGeometry(
  fig: { bars: ReadonlyArray<{ label: string; value: number }> },
  width: number,
) {
  const values = fig.bars.map((b) => b.value);
  const vmin = Math.min(0, ...values);
  const vmax = Math.max(0, ...values);
  const span = vmax - vmin || 1;
  const longest = Math.max(...fig.bars.map((b) => b.label.length));
  const n = fig.bars.length;
  if (n > 6 || longest * CHAR_W > width / n - 6) {
    const rowH = 30;
    const labelW = Math.min(width * 0.38, longest * 7.2 + 8);
    const valueW = 64;
    const pw = width - labelW - valueW;
    return {
      horizontal: true as const,
      rowH,
      labelW,
      height: n * rowH + 4,
      maxChars: Math.max(4, Math.floor((labelW - 8) / 7.2)),
      X: (v: number) => labelW + ((v - vmin) / span) * pw,
      slot: (i: number): Box => ({ x: 0, y: 2 + i * rowH, w: width, h: rowH }),
    };
  }
  const top = 22;
  const bottom = 26;
  const height = 220;
  const ph = height - top - bottom;
  const slotW = width / n;
  return {
    horizontal: false as const,
    height,
    bw: Math.min(56, slotW * 0.62),
    cx: (i: number) => slotW * i + slotW / 2,
    Y: (v: number) => top + (1 - (v - vmin) / span) * ph,
    slot: (i: number): Box => ({ x: slotW * i, y: 0, w: slotW, h: height }),
  };
}

/** The gap with the arrow between two clocks of a span. */
const SPAN_ARROW = 28;

/** One clock face (`count` 1) or two side by side with an arrow between them (a span). */
export function clockGeometry(count: number, width: number) {
  if (count < 2) {
    const d = Math.min(width, 184);
    return { d, arrow: 0, width: d };
  }
  const d = Math.min((width - SPAN_ARROW) / 2, 150);
  return { d, arrow: SPAN_ARROW, width: 2 * d + SPAN_ARROW };
}
