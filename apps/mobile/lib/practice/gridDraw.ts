// What she has drawn on the grid so far, and every step that changes it (issue #249). Pure, so
// each tool is a unit test: set a point, take it away, move it, pull a bar, undo.
//
// The rules of the paper, the same for every mode:
//   · a tap on a free crossing sets the next point (A, then B …; on a graph the next of `count`);
//   · a tap on one of her points takes it away — and the next tap puts that point back, so a point
//     set wrong is fixed with two taps, never with a hunt for a tiny target;
//   · when every point is set, a tap elsewhere moves the one she set or moved last;
//   · the arrow keys move that point one crossing (a bar: ← → choose it, ↑ ↓ pull it one step);
//   · "Zurück" undoes the last step, whatever it was (undo over confirmation, UX-PRINCIPLES).
// A tap without a finger (a screen reader, a keyboard) lands in the middle of the paper and is
// moved from there with the arrows — one way for everyone, as on the note line (#275).
//
// Kept in the question's draft (`lib/drafts.ts`) as JSON, read back with every value checked
// against the paper: a theme switch or a restart never loses her drawing, a stale one never
// sends a point off the grid.

import {
  GridXY,
  gridNumber,
  gridPointText,
  inFrame,
  type GridDrawAnswer,
  type GridDrawTaskView,
  type GridFrame,
} from '@learnbuddy/shared-types/contracts';
import { z } from 'zod';

export type GridDrawState = {
  /** One slot per point she sets, in the order of the names (a graph: `count` of them). */
  points: Array<GridXY | null>;
  /** A bar chart: each bar's value, in the order of the bars. */
  bars: number[];
  /** The point or bar the arrows move. */
  selected: number | null;
};

/** Her drawing with the steps before it, for "Zurück". */
export type GridKept = { now: GridDrawState; past: GridDrawState[] };

/** How many steps "Zurück" goes back. */
const PAST_MAX = 40;

/** How many points she sets on this paper (none on a bar chart). */
function slotsOf(view: GridDrawTaskView): number {
  const { sheet } = view;
  switch (sheet.mode) {
    case 'points':
    case 'mirror':
      return sheet.names.length;
    case 'graph':
      return sheet.count;
    case 'bars':
      return 0;
  }
}

export function emptyGrid(view: GridDrawTaskView): GridKept {
  const bars = view.sheet.mode === 'bars' ? view.sheet.bars.map(() => 0) : [];
  return {
    now: { points: Array.from({ length: slotsOf(view) }, () => null), bars, selected: null },
    past: [],
  };
}

const Stored = z.object({
  now: z.object({
    points: z.array(GridXY.nullable()),
    bars: z.array(z.number().int().min(0)),
    selected: z.number().int().min(0).nullable(),
  }),
  past: z.array(z.unknown()),
});

/** Does a state belong to this paper: as many slots and bars, every point and height on it? */
function fits(state: GridDrawState, view: GridDrawTaskView): boolean {
  const { frame, sheet } = view;
  if (state.points.length !== slotsOf(view)) return false;
  if (!state.points.every((p) => p === null || inFrame(p, frame))) return false;
  if (sheet.mode !== 'bars') return state.bars.length === 0;
  const top = (frame.y_max - frame.y_min) * sheet.step;
  return (
    state.bars.length === sheet.bars.length &&
    state.bars.every((v) => v % sheet.step === 0 && v <= top)
  );
}

/** Her drawing as kept in the draft; anything that does not fit this paper starts empty. */
export function gridFrom(kept: string, view: GridDrawTaskView): GridKept {
  try {
    const parsed = Stored.safeParse(JSON.parse(kept || 'null'));
    if (!parsed.success || !fits(parsed.data.now, view)) return emptyGrid(view);
    const past = parsed.data.past.flatMap((s) => {
      const p = Stored.shape.now.safeParse(s);
      return p.success && fits(p.data, view) ? [p.data] : [];
    });
    return { now: parsed.data.now, past };
  } catch {
    return emptyGrid(view);
  }
}

/** A step: the new state, with the one before it kept for "Zurück". */
function step(kept: GridKept, next: GridDrawState): GridKept {
  return { now: next, past: [...kept.past, kept.now].slice(-PAST_MAX) };
}

const same = (a: GridXY | null, b: GridXY) => a !== null && a.x === b.x && a.y === b.y;

/** The middle crossing of the paper: where a point without a finger lands. */
function middleOf(frame: GridFrame): GridXY {
  return {
    x: Math.round((frame.x_min + frame.x_max) / 2),
    y: Math.round((frame.y_min + frame.y_max) / 2),
  };
}

/** A tap on a crossing (null: without a finger). */
export function tapPoint(kept: GridKept, view: GridDrawTaskView, at: GridXY | null): GridKept {
  const { now } = kept;
  const p = at ?? middleOf(view.frame);
  const mine = now.points.findIndex((q) => same(q, p));
  if (mine >= 0 && at !== null) {
    // Her own point: taken away; the next tap sets it again.
    const points = now.points.map((q, i) => (i === mine ? null : q));
    return step(kept, { ...now, points, selected: null });
  }
  if (mine >= 0) return { ...kept, now: { ...now, selected: mine } };
  const free = now.points.findIndex((q) => q === null);
  const slot = free >= 0 ? free : now.selected;
  if (slot === null) return kept;
  const points = now.points.map((q, i) => (i === slot ? p : q));
  return step(kept, { ...now, points, selected: slot });
}

/** A tap in a bar's column at a height (in rows); null: without a finger — the chosen bar grows a row. */
export function tapBar(
  kept: GridKept,
  view: GridDrawTaskView,
  at: { bar: number; rows: number } | null,
): GridKept {
  if (view.sheet.mode !== 'bars') return kept;
  const { step: unit } = view.sheet;
  const { now } = kept;
  const bar = at?.bar ?? now.selected ?? 0;
  const top = view.frame.y_max - view.frame.y_min;
  const rows = at ? at.rows : Math.min(top, (now.bars[bar] ?? 0) / unit + 1);
  const bars = now.bars.map((v, i) => (i === bar ? rows * unit : v));
  return step(kept, { ...now, bars, selected: bar });
}

/** An arrow key: the chosen point one crossing further, or another bar / its height a step. */
export function nudge(kept: GridKept, view: GridDrawTaskView, dx: number, dy: number): GridKept {
  const { now } = kept;
  const { frame, sheet } = view;
  if (sheet.mode === 'bars') {
    const n = sheet.bars.length;
    const chosen = now.selected ?? 0;
    if (dx !== 0) {
      return { ...kept, now: { ...now, selected: Math.max(0, Math.min(n - 1, chosen + dx)) } };
    }
    const top = (frame.y_max - frame.y_min) * sheet.step;
    const value = Math.max(0, Math.min(top, (now.bars[chosen] ?? 0) + dy * sheet.step));
    if (value === now.bars[chosen] && now.selected !== null) return kept;
    return step(kept, {
      ...now,
      bars: now.bars.map((v, i) => (i === chosen ? value : v)),
      selected: chosen,
    });
  }
  const chosen = now.selected === null ? null : now.points[now.selected];
  if (now.selected === null || !chosen) return kept;
  const to = { x: chosen.x + dx, y: chosen.y + dy };
  if (!inFrame(to, frame) || now.points.some((q) => same(q, to))) return kept;
  return step(kept, { ...now, points: now.points.map((q, i) => (i === now.selected ? to : q)) });
}

/** "Zurück": the step before. */
export function undo(kept: GridKept): GridKept {
  const before = kept.past.at(-1);
  return before ? { now: before, past: kept.past.slice(0, -1) } : kept;
}

/** Ready for "Prüfen": every point set; on a bar chart, one bar drawn at least. */
export function gridComplete(state: GridDrawState): boolean {
  if (state.bars.length > 0) return state.bars.some((v) => v > 0);
  return state.points.length > 0 && state.points.every((p) => p !== null);
}

/** What goes to the server. */
export function gridAnswer(state: GridDrawState, view: GridDrawTaskView): GridDrawAnswer {
  if (view.sheet.mode === 'bars') {
    const { bars } = view.sheet;
    return {
      type: 'grid_draw',
      points: [],
      bars: bars.map((b, i) => ({ id: b.id, value: state.bars[i] ?? 0 })),
    };
  }
  return { type: 'grid_draw', points: state.points.filter((p) => p !== null), bars: [] };
}

/** The name of a point she sets (null on a graph, whose points are only places). */
export function nameOf(view: GridDrawTaskView, slot: number): string | null {
  const { sheet } = view;
  return sheet.mode === 'points' || sheet.mode === 'mirror' ? (sheet.names[slot] ?? null) : null;
}

/** The next point she sets, by name — or by number on a graph ("2" of 2); null when all are set. */
export function nextPoint(state: GridDrawState, view: GridDrawTaskView): string | null {
  const free = state.points.findIndex((p) => p === null);
  if (free < 0) return null;
  return nameOf(view, free) ?? String(free + 1);
}

/** What is drawn, in words: the points she set (by name), or every bar with its value. */
export function drawnWords(state: GridDrawState, view: GridDrawTaskView): string[] {
  if (view.sheet.mode === 'bars') {
    return view.sheet.bars.map((b, i) => `${b.label} ${gridNumber(state.bars[i] ?? 0)}`);
  }
  return state.points.flatMap((p, i) => (p ? [gridPointText(nameOf(view, i), p)] : []));
}
