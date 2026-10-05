// Diagrams as data (issue #247, docs/architecture.md §Practice, Diagrams): boxes with arrows —
// a chain, a cycle, a tree or boxes on a small grid.
//
// The model writes the boxes and the arrows; everything a drawing depends on is COMPUTED here,
// once, for the server and the app alike:
//   - the structure: every arrow between two boxes that exist, no box without an arrow, one
//     piece, a chain without a cycle, a cycle that closes, a tree from one root;
//   - the layout: where each box stands, how its text wraps, where each arrow and its label go,
//     at the width the app has — and at the narrowest phone (`TREE_WIDTH`) a problem when a text
//     does not fit its box, an arrow runs through another box or a label covers something.
// A diagram that breaks a rule is rejected, never repaired (`diagramProblem`).
//
// Dependency-free on purpose: the app imports this file by path (like `trees.ts`), so what the
// server checked is exactly what the app draws.

import { TICK_FONT } from './charts.js';
import { crosses, grow, overlaps, textWidth, type Rect } from './labelBoxes.js';
import { TREE_WIDTH, treeSlots, type XY } from './trees.js';

export type DiagramKind = 'chain' | 'cycle' | 'tree' | 'free';
export type Arrow = { a: number; b: number; l: string };
export type Diagram = {
  type: 'diagram';
  k: DiagramKind;
  n: readonly string[];
  e: readonly Arrow[];
  g: readonly { c: number; r: number }[];
};

export function isDiagram(f: { type: string }): f is Diagram {
  return f.type === 'diagram';
}

export type DiagramProblem =
  /** An arrow to a box that does not exist, a box without an arrow, two pieces, a double text. */
  | 'structure'
  /** Not what its kind says: a chain with a cycle, a cycle that does not close, two roots. */
  | 'shape'
  /** More gaps than letters, or a "?" on an arrow (a gap is a box). */
  | 'gaps'
  /** A text that does not fit its box on the narrowest phone, or a drawing too tall for it. */
  | 'too_wide'
  /** An arrow through another box, or a label over a box, another label or another arrow. */
  | 'overlap';

// ─────────────── the phone it has to fit ───────────────

/** Box text: the figures' small size (12 px, `SMALL` in `figureText`), regular weight. */
export const BOX_FONT = 12;
/** One line of box text. */
export const BOX_LINE = 15;
/** Room inside a box around its text. */
const BOX_PAD_X = 4;
export const BOX_PAD_Y = 6;
/** A box text wraps into at most this many lines. */
const MAX_LINES = 3;
/** A box is never wider than this, however wide the phone. */
const MAX_BOX_W = 150;
/** Between two columns and two rows of boxes: room for an arrow and its head. */
const GAP_X = 22;
const GAP_TREE = 6;
const GAP_Y = 30;
/** An arrow label (11 px, `TICK_FONT`): its height, and its distance from its arrow. */
const LABEL_H = 13;
const LABEL_OFF = 5;
/** Two arrows between the same boxes run this far apart. */
const PAIR_OFF = 6;
/** The tallest diagram the narrowest phone shows next to its question. */
const DIAGRAM_MAX_HEIGHT = 300;
/** Gaps are lettered in the order of the boxes. */
const GAP_LETTERS = ['A', 'B', 'C'];

export const isGap = (text: string) => text.trim() === '?';

/** Each box's gap letter ("A", "B", "C") or null when it is no gap. */
export function gapLetters(d: Pick<Diagram, 'n'>): (string | null)[] {
  let k = 0;
  return d.n.map((text) => (isGap(text) ? (GAP_LETTERS[k++] ?? null) : null));
}

// ─────────────── structure ───────────────

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

type Links = { out: number[][]; into: number[][] };

function links(d: Diagram): Links {
  const out: number[][] = d.n.map(() => []);
  const into: number[][] = d.n.map(() => []);
  for (const { a, b } of d.e) {
    out[a]?.push(b);
    into[b]?.push(a);
  }
  // Children and successors in the order the boxes are listed.
  out.forEach((x) => x.sort((p, q) => p - q));
  return { out, into };
}

function connected(d: Diagram, { out, into }: Links): boolean {
  const seen = new Set([0]);
  const todo = [0];
  while (todo.length > 0) {
    const i = todo.pop() as number;
    for (const j of [...(out[i] ?? []), ...(into[i] ?? [])]) {
      if (!seen.has(j)) {
        seen.add(j);
        todo.push(j);
      }
    }
  }
  return seen.size === d.n.length;
}

function structureProblem(d: Diagram): DiagramProblem | null {
  const n = d.n.length;
  const pairs = new Set<string>();
  for (const { a, b } of d.e) {
    if (a >= n || b >= n || a === b || pairs.has(`${a}>${b}`)) return 'structure';
    pairs.add(`${a}>${b}`);
  }
  const shown = d.n.filter((text) => !isGap(text)).map(norm);
  if (new Set(shown).size !== shown.length) return 'structure';
  const l = links(d);
  // No box without an arrow, and one piece: a box on its own explains nothing.
  if (d.n.some((_, i) => (l.out[i]?.length ?? 0) + (l.into[i]?.length ?? 0) === 0)) {
    return 'structure';
  }
  if (!connected(d, l)) return 'structure';
  if (d.n.filter(isGap).length > GAP_LETTERS.length) return 'gaps';
  if (d.e.some((x) => isGap(x.l))) return 'gaps';
  return null;
}

/** The boxes in their order along a chain or around a cycle; null when the kind does not hold. */
function sequence(d: Diagram, { out, into }: Links): number[] | null {
  const n = d.n.length;
  const one = (x: number[][]) => x.every((y) => y.length <= 1);
  if (!one(out) || !one(into)) return null;
  const starts = d.n.map((_, i) => i).filter((i) => into[i]?.length === 0);
  if (d.k === 'chain' ? d.e.length !== n - 1 || starts.length !== 1 : d.e.length !== n) {
    return null;
  }
  const order = [starts[0] ?? 0];
  while (order.length < n) {
    const next = out[order[order.length - 1] as number]?.[0];
    if (next === undefined || order.includes(next)) return null;
    order.push(next);
  }
  return order;
}

/** The root of a tree, or null when the arrows do not make one. */
function treeRoot(d: Diagram, { into }: Links): number | null {
  if (d.e.length !== d.n.length - 1 || into.some((x) => x.length > 1)) return null;
  const roots = d.n.map((_, i) => i).filter((i) => into[i]?.length === 0);
  return roots.length === 1 ? (roots[0] as number) : null;
}

function shapeProblem(d: Diagram, l: Links): DiagramProblem | null {
  if (d.k !== 'free') {
    if (d.g.length !== 0) return 'shape';
    if (d.k === 'tree') return treeRoot(d, l) === null ? 'shape' : null;
    return sequence(d, l) === null ? 'shape' : null;
  }
  if (d.g.length !== d.n.length) return 'shape';
  const cells = new Set(d.g.map((p) => `${p.c},${p.r}`));
  return cells.size === d.g.length ? null : 'shape';
}

// ─────────────── layout ───────────────

/** A box's place: column (fractional between two) and row. */
type Cell = { col: number; row: number };

/**
 * A text in lines no wider than `width` at the box font, broken between words; null when a word
 * is wider than a line or the text needs more than `MAX_LINES` lines.
 */
export function wrapWords(text: string, width: number): string[] | null {
  const fits = (s: string) => textWidth(s, BOX_FONT) <= width;
  const lines: string[] = [];
  for (const word of text.trim().split(/\s+/)) {
    if (!fits(word)) return null;
    const last = lines[lines.length - 1];
    if (last !== undefined && fits(`${last} ${word}`)) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.length <= MAX_LINES ? lines : null;
}

export type DiagramBox = { x: number; y: number; w: number; h: number; lines: string[] };
export type DiagramLabel = { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
export type DiagramArrow = { from: XY; to: XY; label: DiagramLabel | null };
export type DiagramLayout = { boxes: DiagramBox[]; arrows: DiagramArrow[]; height: number };

const labelWidth = (text: string) => textWidth(text, TICK_FONT);

/** Where the line from `c` towards `d` leaves the box around `c` (plus a margin). */
function leaveBox(c: XY, d: XY, box: DiagramBox, margin: number): XY {
  const dx = d.x - c.x;
  const dy = d.y - c.y;
  const tx = dx === 0 ? Infinity : (box.w / 2 + margin) / Math.abs(dx);
  const ty = dy === 0 ? Infinity : (box.h / 2 + margin) / Math.abs(dy);
  const t = Math.min(tx, ty);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Where an arrow's label may stand, best first: above a level arrow (below the lower one of a
 * pair), beside an upright or slanted one — on the side a pair moved it to, else either side.
 */
function labelSpots(from: XY, to: XY, normal: XY, paired: boolean): DiagramLabel[] {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (Math.abs(from.y - to.y) < 1) {
    const above = { x: mid.x, y: mid.y - LABEL_OFF, anchor: 'middle' as const };
    const below = { x: mid.x, y: mid.y + LABEL_OFF + LABEL_H - 3, anchor: 'middle' as const };
    return paired && normal.y > 0 ? [below] : paired ? [above] : [above, below];
  }
  // A slanted arrow runs on through half the label's height on its side: it steps aside by that.
  const lean = Math.min(40, (Math.abs(to.x - from.x) / Math.abs(to.y - from.y)) * (LABEL_H / 2));
  const right = { x: mid.x + LABEL_OFF + lean, y: mid.y + 4, anchor: 'start' as const };
  const left = { x: mid.x - LABEL_OFF - lean, y: mid.y + 4, anchor: 'end' as const };
  if (paired) return [normal.x < 0 ? left : right];
  return [right, left];
}

/** Room for a box centred at `x` in its row: up to half-way to its neighbours and the edges. */
function stretchedWidth(x: number, row: number[], width: number, gapX: number): number {
  const room = row.reduce(
    (m, other) => (other === x ? m : Math.min(m, (Math.abs(other - x) - gapX) / 2)),
    Math.min(x, width - x),
  );
  return Math.min(MAX_BOX_W, 2 * room);
}

/**
 * The boxes on their cells, at `width`; null when a text does not fit its box. `stretch` lets a
 * box take the room its row leaves it (a tree's parents over their children).
 */
function place(
  d: Diagram,
  cells: Cell[],
  cols: number,
  gap: number,
  width: number,
  stretch = false,
): DiagramLayout | null {
  // A labelled arrow between two boxes side by side needs its label's room between them.
  let gapX = gap;
  for (const x of d.e) {
    const [p, q] = [cells[x.a], cells[x.b]];
    if (x.l !== '' && p && q && p.row === q.row) gapX = Math.max(gapX, labelWidth(x.l) + 10);
  }
  const w = Math.min(MAX_BOX_W, (width - (cols - 1) * gapX) / cols);
  if (w <= 2 * BOX_PAD_X) return null;
  const left = (width - (cols * w + (cols - 1) * gapX)) / 2;
  const cx = cells.map((c) => left + c.col * (w + gapX) + w / 2);
  const widths = cells.map((c, i) => {
    if (!stretch) return w;
    const row = cx.filter((_, j) => cells[j]?.row === c.row);
    return stretchedWidth(cx[i] as number, row, width, gapX);
  });
  const letters = gapLetters(d);
  const texts = d.n.map((text, i) =>
    letters[i] ? [letters[i] as string] : wrapWords(text, (widths[i] as number) - 2 * BOX_PAD_X),
  );
  if (texts.some((t) => t === null)) return null;
  const rows = Math.max(...cells.map((c) => c.row)) + 1;
  const rowH = Array.from({ length: rows }, (_, r) =>
    Math.max(0, ...texts.map((t, i) => (cells[i]?.row === r ? (t?.length ?? 1) : 0))),
  ).map((lines) => lines * BOX_LINE + 2 * BOX_PAD_Y);
  const top = rowH.map((_, r) => 2 + rowH.slice(0, r).reduce((s, h) => s + h + GAP_Y, 0));
  const boxes = texts.map((t, i) => {
    const c = cells[i] as Cell;
    const lines = t as string[];
    const bw = widths[i] as number;
    const h = lines.length * BOX_LINE + 2 * BOX_PAD_Y;
    const y = (top[c.row] ?? 0) + ((rowH[c.row] ?? h) - h) / 2;
    return { x: (cx[i] as number) - bw / 2, y, w: bw, h, lines };
  });
  const pairs = new Set(d.e.map((x) => `${x.a}>${x.b}`));
  const lines = d.e.map((x) => {
    const [p, q] = [boxes[x.a] as DiagramBox, boxes[x.b] as DiagramBox];
    let a = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    let b = { x: q.x + q.w / 2, y: q.y + q.h / 2 };
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    // The way back runs beside the way there: each one moved to its own right.
    const paired = pairs.has(`${x.b}>${x.a}`);
    if (paired) {
      a = { x: a.x + normal.x * PAIR_OFF, y: a.y + normal.y * PAIR_OFF };
      b = { x: b.x + normal.x * PAIR_OFF, y: b.y + normal.y * PAIR_OFF };
    }
    return { from: leaveBox(a, b, p, 2), to: leaveBox(b, a, q, 2), normal, paired };
  });
  const free = (text: string, at: DiagramLabel) =>
    labelClear(labelRect(text, at), boxes, lines, width);
  const arrows = lines.map(({ from, to, normal, paired }, k) => {
    const text = d.e[k]?.l ?? '';
    if (text === '') return { from, to, label: null };
    const spots = labelSpots(from, to, normal, paired);
    return { from, to, label: spots.find((at) => free(text, at)) ?? (spots[0] as DiagramLabel) };
  });
  const height = (top[rows - 1] ?? 0) + (rowH[rows - 1] ?? 0) + 2;
  return { boxes, arrows, height };
}

/** Cells of a snake: left to right, then the next row back, `cols` boxes a row. */
const snake = (order: number[], cols: number): Cell[] => {
  const cells: Cell[] = [];
  order.forEach((box, k) => {
    const row = Math.floor(k / cols);
    const pos = k % cols;
    cells[box] = { col: row % 2 === 0 ? pos : cols - 1 - pos, row };
  });
  return cells;
};

/**
 * Cells of a ring in two columns: the first box top left (top centre when the count is odd),
 * down the right column, back up the left one — clockwise, as a Kreislauf is drawn.
 */
const ring = (order: number[]): Cell[] => {
  const n = order.length;
  const cells: Cell[] = [];
  const odd = n % 2 === 1;
  const side = Math.floor(n / 2);
  order.forEach((box, k) => {
    if (odd) {
      if (k === 0) cells[box] = { col: 0.5, row: 0 };
      else if (k <= side) cells[box] = { col: 1, row: k };
      else cells[box] = { col: 0, row: n - k };
    } else if (k === 0) {
      cells[box] = { col: 0, row: 0 };
    } else if (k <= side) {
      cells[box] = { col: 1, row: k - 1 };
    } else {
      cells[box] = { col: 0, row: n - k };
    }
  });
  return cells;
};

/**
 * Where each box, each arrow and each label stands at `width`; null when the diagram does not
 * hold or a text does not fit its box. A chain is a snake with as many boxes a row as fit on two
 * lines each (four at most), a cycle a ring in two columns, a tree top down from its root, a free
 * diagram its grid.
 */
export function diagramLayout(d: Diagram, width: number): DiagramLayout | null {
  const l = links(d);
  if (structureProblem(d) !== null || shapeProblem(d, l) !== null) return null;
  switch (d.k) {
    case 'chain': {
      const order = sequence(d, l) as number[];
      for (let cols = Math.min(4, order.length); cols > 2; cols--) {
        const tried = place(d, snake(order, cols), cols, GAP_X, width);
        if (tried && tried.boxes.every((b) => b.lines.length <= 2)) return tried;
      }
      return place(d, snake(order, 2), 2, GAP_X, width);
    }
    case 'cycle':
      return place(d, ring(sequence(d, l) as number[]), 2, GAP_X, width);
    case 'tree': {
      const { slot, depth, leaves } = treeSlots(l.out, treeRoot(d, l) as number);
      const cells = d.n.map((_, i) => ({ col: slot[i] ?? 0, row: depth[i] ?? 0 }));
      return place(d, cells, Math.max(1, leaves), GAP_TREE, width, true);
    }
    case 'free': {
      // Rows nobody uses are left out; columns stay, an empty one can carry a slanted arrow.
      const rows = [...new Set(d.g.map((p) => p.r))].sort((a, b) => a - b);
      const cells = d.g.map((p) => ({ col: p.c, row: rows.indexOf(p.r) }));
      return place(d, cells, Math.max(...d.g.map((p) => p.c)) + 1, GAP_X, width);
    }
  }
}

// ─────────────── does it fit? ───────────────

function labelRect(text: string, at: DiagramLabel): Rect {
  const w = labelWidth(text);
  const x = at.anchor === 'start' ? at.x : at.anchor === 'end' ? at.x - w : at.x - w / 2;
  return { x, y: at.y - LABEL_H + 3, w, h: LABEL_H };
}

/**
 * Whether a label stands on the phone, over no box and across no arrow — another one or its own,
 * which would make it read as the wrong arrow's.
 */
function labelClear(
  r: Rect,
  boxes: readonly Rect[],
  lines: readonly { from: XY; to: XY }[],
  width: number,
): boolean {
  if (r.x < 0 || r.x + r.w > width) return false;
  if (boxes.some((box) => overlaps(r, grow(box, 1)))) return false;
  return !lines.some((line) => crosses(line.from, line.to, r));
}

/** What a laid-out diagram covers that it must not, at `width`. */
function layoutProblem(d: Diagram, layout: DiagramLayout, width: number): DiagramProblem | null {
  if (layout.height > DIAGRAM_MAX_HEIGHT) return 'too_wide';
  const labels: { r: Rect; k: number }[] = [];
  for (const [k, arrow] of layout.arrows.entries()) {
    const x = d.e[k] as Arrow;
    if (Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y) < 12) return 'overlap';
    const through = layout.boxes.some(
      (box, i) => i !== x.a && i !== x.b && crosses(arrow.from, arrow.to, grow(box, 2)),
    );
    if (through) return 'overlap';
    if (arrow.label) labels.push({ r: labelRect(x.l, arrow.label), k });
  }
  for (const { r, k } of labels) {
    if (!labelClear(r, layout.boxes, layout.arrows, width)) return 'overlap';
    if (labels.some((o) => o.k !== k && overlaps(r, o.r))) return 'overlap';
  }
  return null;
}

/** The first rule a diagram breaks, or null when it holds and fits the narrowest phone. */
export function diagramProblem(d: Diagram): DiagramProblem | null {
  const structure = structureProblem(d);
  if (structure !== null) return structure;
  const shape = shapeProblem(d, links(d));
  if (shape !== null) return shape;
  const layout = diagramLayout(d, TREE_WIDTH);
  return layout === null ? 'too_wide' : layoutProblem(d, layout, TREE_WIDTH);
}

/**
 * Whether `text` stands in a box or on an arrow the diagram shows, as a whole word (case and
 * spacing aside): the answer to a gap must not be readable elsewhere in its own picture.
 */
export function diagramShows(d: Diagram, text: string): boolean {
  const needle = norm(text);
  if (needle === '') return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const word = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'u');
  return [...d.n.filter((t) => !isGap(t)), ...d.e.map((x) => x.l)].some((t) => word.test(norm(t)));
}
