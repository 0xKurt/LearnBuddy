// Das Layout der Schemata und Bäume (issues #247, #256): wo jedes Kästchen, jeder Pfeil, jeder
// Ast und jedes Symbol steht. **Code legt aus, nicht das Modell** — und zwar EINE Rechnung für
// beide Seiten: der Server ruft sie, bevor er eine Frage anlegt, und verwirft jede Figur, die
// auf 360 pt nicht ohne Überlappung passt (`layoutFits`); die App ruft dieselbe Rechnung und
// zeichnet, was herauskommt. Zwei Layouts wären zwei Wahrheiten, und die Prüfung hätte die
// falsche geprüft.
//
// Alle Maße in einem festen logischen Raum von `LAYOUT_W` Breite. Die App skaliert das Ganze
// auf die Breite, die sie hat (eine Fragekarte auf 360 pt ist ungefähr so breit), und
// `FigureView` verkleinert es weiter, wenn es zu hoch ist. Textbreiten werden geschätzt, nicht
// gemessen — mit einer großzügigen Breite pro Zeichen, damit eine echte Schrift nie breiter ist
// als die Schätzung.

import type { AutomatonFigure, DiagramFigure, PedigreeFigure, ProbTreeFigure } from './graph.js';

/** Die logische Breite jeder Figur dieser Art. */
export const LAYOUT_W = 280;
/** Die Schriftgröße in Kästchen und an Ästen. */
export const FONT = 12;
/** Zeilenhöhe im Kästchen. */
export const LINE_H = 15;
/** Höchstens so viele Zeilen in einem Kästchen; mehr ist kein Kästchen, sondern ein Absatz. */
export const BOX_LINES_MAX = 4;

const PAD_X = 6;
const PAD_Y = 6;
/** Mindestabstand zwischen zwei Kästchen, damit ein Pfeil mit Spitze dazwischen passt. */
const GAP_X = 28;
const GAP_Y = 30;
/** Radius des Nummernkreises auf einem Pfeil. */
export const TAG_R = 8;

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

// ─────────────── Text ───────────────

/**
 * Die geschätzte Breite eines Zeichens in Einheiten der Schriftgröße. Bewusst großzügig: eine
 * Systemschrift auf Android, iOS und im Web ist schmaler, nie breiter — sonst liefe ein Wort
 * über den Rand des Kästchens, das der Server für passend gehalten hat.
 */
function charWidth(ch: string): number {
  if (" .,:;'!|il1ijtfr()-".includes(ch)) return 0.34;
  if ('mwMW'.includes(ch)) return 0.9;
  if (/[A-ZÄÖÜ]/.test(ch)) return 0.7;
  if (/[0-9]/.test(ch)) return 0.58;
  return 0.58;
}

export function textWidth(text: string, size = FONT): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch);
  return w * size;
}

/**
 * Ein Text in Zeilen, die in `width` passen: an Leerzeichen und Bindestrichen umbrochen, und ein
 * Wort, das allein zu lang ist, mit Trennstrich geteilt („Grundwasser-|neubildung"). Immer gleich
 * — die App zeichnet genau diese Zeilen.
 */
export function wrapText(text: string, width: number, size = FONT): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const push = (word: string) => {
    const tryLine = line === '' ? word : `${line} ${word}`;
    if (textWidth(tryLine, size) <= width) {
      line = tryLine;
      return;
    }
    if (line !== '') lines.push(line);
    line = '';
    // A word longer than the line: split it, keeping a hyphen at each cut.
    let rest = word;
    while (textWidth(rest, size) > width) {
      let cut = 1;
      while (cut < rest.length && textWidth(`${rest.slice(0, cut + 1)}-`, size) <= width) cut++;
      lines.push(`${rest.slice(0, cut)}-`);
      rest = rest.slice(cut);
    }
    line = rest;
  };
  for (const w of words) push(w);
  if (line !== '') lines.push(line);
  return lines;
}

// ─────────────── Geometrie ───────────────

/** Wo die Strecke von der Mitte von `r` nach `toward` den Rand von `r` verlässt. */
function borderPoint(r: Rect, toward: Point): Point {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? Infinity : r.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : r.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: cx + dx * s, y: cy + dy * s };
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Überlappen sich zwei Rechtecke (mit `gap` Abstand dazwischen)? */
export function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

/** Schneidet die Strecke p→q das Rechteck r (mit 2 Einheiten Luft)? Liang–Barsky. */
export function segmentHitsRect(p: Point, q: Point, r: Rect): boolean {
  const x0 = r.x - 2;
  const y0 = r.y - 2;
  const x1 = r.x + r.w + 2;
  const y1 = r.y + r.h + 2;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t0 = 0;
  let t1 = 1;
  const checks: [number, number][] = [
    [-dx, p.x - x0],
    [dx, x1 - p.x],
    [-dy, p.y - y0],
    [dy, y1 - p.y],
  ];
  for (const [pp, qq] of checks) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const t = qq / pp;
      if (pp < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

const inside = (r: Rect, w: number, h: number) =>
  r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;

// ─────────────── Schema: Kästchen und Pfeile (#247) ───────────────

export type DiagramBox = Rect & { lines: string[]; blank: boolean };
export type DiagramArrow = { from: Point; to: Point; tag: string; tagAt: Point | null };
export type DiagramLayout = {
  width: number;
  height: number;
  boxes: DiagramBox[];
  arrows: DiagramArrow[];
  /** Die Legende unter dem Schema: je Zeile Nummer und Beschriftung. */
  legend: { tag: string; lines: string[]; y: number }[];
  /** Hält das Layout? Sonst ist `why` der erste Grund, warum nicht. */
  fits: boolean;
  why: string | null;
};

/** Grid slots (column, row) for each shape and node count, in walking order. */
function slots(shape: 'chain' | 'cycle', n: number): { cols: number; at: [number, number][] } {
  if (shape === 'chain') {
    const cols = n <= 3 ? 3 : n <= 6 ? 2 : 3;
    const at: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const k = i % cols;
      // A snake: left to right, then right to left, so every arrow joins two neighbours.
      at.push([row % 2 === 0 ? k : cols - 1 - k, row]);
    }
    // Three boxes in a row of three: the row is full; fewer would leave a hole, so centre them.
    return { cols, at };
  }
  // A cycle walks round the edge of a grid, clockwise from the top left.
  switch (n) {
    case 3:
      return {
        cols: 2,
        at: [
          [0.5, 0],
          [1, 1],
          [0, 1],
        ],
      };
    case 4:
      return {
        cols: 2,
        at: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      };
    case 5:
      return {
        cols: 2,
        at: [
          [0, 0],
          [1, 0],
          [1, 1],
          [1, 2],
          [0, 2],
        ],
      };
    case 6:
      return {
        cols: 2,
        at: [
          [0, 0],
          [1, 0],
          [1, 1],
          [1, 2],
          [0, 2],
          [0, 1],
        ],
      };
    case 7:
      return {
        cols: 3,
        at: [
          [0, 0],
          [1, 0],
          [2, 0],
          [2, 1],
          [2, 2],
          [1, 2],
          [0, 2],
        ],
      };
    default:
      return {
        cols: 3,
        at: [
          [0, 0],
          [1, 0],
          [2, 0],
          [2, 1],
          [2, 2],
          [1, 2],
          [0, 2],
          [0, 1],
        ],
      };
  }
}

/** Layers for a web: longest path from the boxes nothing points to, back edges ignored. */
function webSlots(fig: DiagramFigure): { cols: number; at: [number, number][] } | null {
  const n = fig.boxes.length;
  // Back edges by a depth-first walk in box order: those are left out of the layering.
  const state = new Array<number>(n).fill(0);
  const forward: { from: number; to: number }[] = [];
  const visit = (v: number) => {
    state[v] = 1;
    for (const a of fig.arrows.filter((x) => x.from === v)) {
      if (state[a.to] === 1) continue; // back edge
      forward.push(a);
      if (state[a.to] === 0) visit(a.to);
    }
    state[v] = 2;
  };
  for (let v = 0; v < n; v++) if (state[v] === 0) visit(v);
  const layer = new Array<number>(n).fill(0);
  for (let round = 0; round < n; round++) {
    for (const a of forward)
      layer[a.to] = Math.max(layer[a.to] as number, (layer[a.from] as number) + 1);
  }
  const rows: number[][] = [];
  for (let v = 0; v < n; v++) (rows[layer[v] as number] ??= []).push(v);
  if (rows.length > 4 || rows.some((r) => r === undefined)) return null;
  const widest = Math.max(...rows.map((r) => r.length));
  if (widest > 3) return null;
  const cols = widest <= 2 ? 2 : 3;
  const at: [number, number][] = new Array(n);
  rows.forEach((row, r) => {
    // Within a row: by the mean place of what points into it (the barycentre), then box order,
    // so a web reads with as few crossings as a fixed rule can give.
    const key = (v: number) => {
      const from = fig.arrows.filter((a) => a.to === v && (layer[a.from] as number) < r);
      if (from.length === 0) return v;
      return from.reduce((s, a) => s + ((at[a.from] as [number, number])[0] ?? 0), 0) / from.length;
    };
    const sorted = [...row].sort((a, b) => key(a) - key(b) || a - b);
    const offset = (cols - sorted.length) / 2;
    sorted.forEach((v, k) => {
      at[v] = [offset + k, r];
    });
  });
  return { cols, at };
}

export function diagramLayout(fig: DiagramFigure): DiagramLayout {
  const n = fig.boxes.length;
  const grid = fig.shape === 'web' ? webSlots(fig) : slots(fig.shape, n);
  const fail = (why: string): DiagramLayout => ({
    width: LAYOUT_W,
    height: 0,
    boxes: [],
    arrows: [],
    legend: [],
    fits: false,
    why,
  });
  if (grid === null) return fail('web too wide or too deep');
  const cols = grid.cols;
  const boxW = (LAYOUT_W - (cols - 1) * GAP_X) / cols;
  const inner = boxW - 2 * PAD_X;
  const wrapped = fig.boxes.map((b) => wrapText(b.text, inner));
  const lines = Math.max(1, ...wrapped.map((l) => l.length));
  if (lines > BOX_LINES_MAX) return fail('box text too long');
  // Every box of one figure is the same height, so rows line up and no tile is ragged.
  const boxH = lines * LINE_H + 2 * PAD_Y;
  const rowsUsed = Math.max(...grid.at.map(([, r]) => r)) + 1;
  const pitchX = boxW + GAP_X;
  const pitchY = boxH + GAP_Y;
  const boxes: DiagramBox[] = fig.boxes.map((b, i) => {
    const [c, r] = grid.at[i] as [number, number];
    return {
      x: c * pitchX,
      y: r * pitchY,
      w: boxW,
      h: boxH,
      lines: wrapped[i] as string[],
      blank: b.blank,
    };
  });
  // Arrows: border to border along the line between the centres; a pair that points both ways
  // is drawn as two parallel arrows, each moved 5 units to its own side.
  const arrows: DiagramArrow[] = fig.arrows.map((a) => {
    const A = boxes[a.from] as DiagramBox;
    const B = boxes[a.to] as DiagramBox;
    let p = borderPoint(A, centre(B));
    let q = borderPoint(B, centre(A));
    if (fig.arrows.some((o) => o.from === a.to && o.to === a.from)) {
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ox = (-dy / len) * 5;
      const oy = (dx / len) * 5;
      p = { x: p.x + ox, y: p.y + oy };
      q = { x: q.x + ox, y: q.y + oy };
    }
    return {
      from: p,
      to: q,
      tag: a.tag,
      tagAt: a.tag === '' ? null : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 },
    };
  });
  const diagramH = rowsUsed * boxH + (rowsUsed - 1) * GAP_Y;
  // The legend: one row per labelled arrow, under the diagram.
  const legend: DiagramLayout['legend'] = [];
  let y = diagramH + (fig.legend.length > 0 ? 18 : 0);
  fig.legend.forEach((label, i) => {
    const l = wrapText(label, LAYOUT_W - 2 * TAG_R - 10);
    legend.push({ tag: String(i + 1), lines: l, y });
    y += l.length * LINE_H + 6;
  });
  const height = fig.legend.length > 0 ? y - 6 : diagramH;
  const layout: DiagramLayout = {
    width: LAYOUT_W,
    height,
    boxes,
    arrows,
    legend,
    fits: true,
    why: null,
  };
  const why = diagramProblem(layout, fig);
  return why === null ? layout : { ...layout, fits: false, why };
}

/** The first reason a diagram layout does not hold, or null. */
function diagramProblem(l: DiagramLayout, fig: DiagramFigure): string | null {
  for (const b of l.boxes) if (!inside(b, l.width, l.height)) return 'box outside';
  for (let i = 0; i < l.boxes.length; i++)
    for (let j = i + 1; j < l.boxes.length; j++)
      if (overlaps(l.boxes[i] as Rect, l.boxes[j] as Rect, 8)) return 'boxes overlap';
  for (const [k, a] of l.arrows.entries()) {
    const spec = fig.arrows[k] as DiagramFigure['arrows'][number];
    // Long enough to see its head.
    if (Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y) < 16) return 'arrow too short';
    // Never through a box it does not join.
    for (const [bi, b] of l.boxes.entries()) {
      if (bi === spec.from || bi === spec.to) continue;
      if (segmentHitsRect(a.from, a.to, b)) return 'arrow through a box';
    }
  }
  // Number tags must not sit on a box or on each other.
  const tags = l.arrows.flatMap((a) =>
    a.tagAt ? [{ x: a.tagAt.x - TAG_R, y: a.tagAt.y - TAG_R, w: 2 * TAG_R, h: 2 * TAG_R }] : [],
  );
  for (const t of tags) for (const b of l.boxes) if (overlaps(t, b, 1)) return 'tag on a box';
  for (let i = 0; i < tags.length; i++)
    for (let j = i + 1; j < tags.length; j++)
      if (overlaps(tags[i] as Rect, tags[j] as Rect, 1)) return 'tags overlap';
  return null;
}

// ─────────────── Baumdiagramm (#256) ───────────────

export type ProbTreeLayout = {
  width: number;
  height: number;
  /** The root point; every first-stage branch starts here. */
  root: Point;
  nodes: { at: Point; text: Rect & { text: string }; label: Rect & { text: string } }[];
  /** Branch k joins the end of its parent (or the root) to node k. */
  branches: { from: Point; to: Point }[];
  fits: boolean;
  why: string | null;
};

/** Leaf pitch: two sibling labels at 60 % along their branches must not touch. */
const LEAF_PITCH = 30;
const NODE_H = 18;

export function probTreeLayout(fig: ProbTreeFigure): ProbTreeLayout {
  const nodes = fig.nodes;
  const depthOf = (k: number): number => {
    let d = 0;
    let at = k;
    while ((nodes[at]?.parent ?? -1) >= 0) {
      at = nodes[at]?.parent as number;
      d++;
    }
    return d;
  };
  const depth = nodes.map((_, k) => depthOf(k));
  const stages = Math.max(0, ...depth) + 1;
  // Each stage's column is as wide as its widest word.
  const colW = Array.from({ length: stages }, (_, s) =>
    Math.max(0, ...nodes.filter((_, k) => depth[k] === s).map((n) => textWidth(n.text) + 8)),
  );
  const rootX = 4;
  const branchW = (LAYOUT_W - rootX - colW.reduce((a, b) => a + b, 0)) / stages;
  const kids = (k: number) => nodes.map((_, i) => i).filter((i) => nodes[i]?.parent === k);
  // Leaves top to bottom in depth-first order; an inner node sits at the mean of its children.
  const y = new Array<number>(nodes.length).fill(0);
  let next = NODE_H / 2;
  const place = (k: number): number => {
    const ch = kids(k);
    if (ch.length === 0) {
      const at = next;
      next += LEAF_PITCH;
      if (k >= 0) y[k] = at;
      return at;
    }
    const ys = ch.map(place);
    const at = (Math.min(...ys) + Math.max(...ys)) / 2;
    if (k >= 0) y[k] = at;
    return at;
  };
  const rootY = place(-1);
  const height = next - LEAF_PITCH + NODE_H / 2;
  const colX = (s: number) =>
    rootX + (s + 1) * branchW + colW.slice(0, s).reduce((a, b) => a + b, 0);
  const out: ProbTreeLayout['nodes'] = nodes.map((n, k) => {
    const x = colX(depth[k] as number);
    const yy = y[k] as number;
    const tw = textWidth(n.text) + 8;
    const parentEnd: Point =
      n.parent < 0
        ? { x: rootX, y: rootY }
        : {
            x: colX(depth[n.parent] as number) + (colW[depth[n.parent] as number] as number),
            y: y[n.parent] as number,
          };
    const lw = textWidth(n.p) + 8;
    const t = 0.6;
    const lx = parentEnd.x + (x - parentEnd.x) * t;
    const ly = parentEnd.y + (yy - parentEnd.y) * t;
    return {
      at: { x, y: yy },
      text: { x, y: yy - NODE_H / 2, w: tw, h: NODE_H, text: n.text },
      label: { x: lx - lw / 2, y: ly - 8, w: lw, h: 16, text: n.p },
    };
  });
  const branches = nodes.map((n, k) => {
    const from: Point =
      n.parent < 0
        ? { x: rootX, y: rootY }
        : {
            x: colX(depth[n.parent] as number) + (colW[depth[n.parent] as number] as number) - 2,
            y: y[n.parent] as number,
          };
    return { from, to: { x: (out[k] as { at: Point }).at.x + 1, y: y[k] as number } };
  });
  const layout: ProbTreeLayout = {
    width: LAYOUT_W,
    height,
    root: { x: rootX, y: rootY },
    nodes: out,
    branches,
    fits: true,
    why: null,
  };
  let why: string | null = null;
  if (branchW < 44) why = 'branches too short';
  const rects = out.flatMap((o) => [o.text, o.label]);
  for (const r of rects) if (!inside(r, LAYOUT_W, height)) why ??= 'outside';
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (overlaps(rects[i] as Rect, rects[j] as Rect, 1)) why ??= 'labels overlap';
  return why === null ? layout : { ...layout, fits: false, why };
}

// ─────────────── Stammbaum (#256) ───────────────

/** Ein Symbol: 22 Einheiten, Quadrat für Männer, Kreis für Frauen. */
export const SYMBOL = 22;
const SLOT = 36;
const ROW_H = 66;

export type PedigreeLayout = {
  width: number;
  height: number;
  people: Point[];
  /** Ehelinien zwischen den Partnern. */
  couples: { from: Point; to: Point }[];
  /** Von der Mitte der Ehelinie hinunter zur Geschwisterlinie, und je ein Strich zu jedem Kind. */
  families: { drop: [Point, Point]; bar: [Point, Point]; stubs: [Point, Point][] }[];
  fits: boolean;
  why: string | null;
};

export function pedigreeLayout(fig: PedigreeFigure): PedigreeLayout {
  const people = fig.people;
  const n = people.length;
  const childrenOf = (a: number, b: number) =>
    people
      .map((_, i) => i)
      .filter((i) => {
        const ps = people[i]?.parents ?? [];
        return ps.length === 2 && ps.includes(a) && ps.includes(b);
      });
  // A unit is a blood relative and the partner to the right. Its width is the larger of its
  // own two slots and the width of everything below it (a tidy tree of families).
  const widthOf = (p: number): number => {
    const s = people[p]?.spouse ?? -1;
    const own = s === -1 ? 1 : 2;
    if (s === -1) return own;
    const below = childrenOf(p, s).reduce((sum, c) => sum + widthOf(c), 0);
    return Math.max(own, below);
  };
  const at: Point[] = new Array(n);
  const place = (p: number, left: number, row: number) => {
    const s = people[p]?.spouse ?? -1;
    const w = widthOf(p);
    const own = s === -1 ? 1 : 2;
    const yy = row * ROW_H + SYMBOL / 2 + 2;
    const start = left + ((w - own) * SLOT) / 2;
    at[p] = { x: start + SLOT / 2, y: yy };
    if (s !== -1) at[s] = { x: start + SLOT + SLOT / 2, y: yy };
    if (s === -1) return;
    const ch = childrenOf(p, s);
    const below = ch.reduce((sum, c) => sum + widthOf(c), 0);
    let x = left + ((w - below) * SLOT) / 2;
    for (const c of ch) {
      place(c, x, row + 1);
      x += widthOf(c) * SLOT;
    }
  };
  // Person 1 is the founding father, by construction of the reading order.
  const totalSlots = widthOf(0);
  const width = totalSlots * SLOT;
  place(0, (LAYOUT_W - width) / 2, 0);
  const rows = Math.max(...at.map((p) => Math.round((p.y - SYMBOL / 2 - 2) / ROW_H))) + 1;
  const height = (rows - 1) * ROW_H + SYMBOL + 2 + 16;
  const couples: PedigreeLayout['couples'] = [];
  const families: PedigreeLayout['families'] = [];
  people.forEach((p, i) => {
    if (p.spouse <= i) return;
    const a = at[i] as Point;
    const b = at[p.spouse] as Point;
    couples.push({ from: { x: a.x + SYMBOL / 2, y: a.y }, to: { x: b.x - SYMBOL / 2, y: b.y } });
    const ch = childrenOf(i, p.spouse);
    if (ch.length === 0) return;
    const mid = { x: (a.x + b.x) / 2, y: a.y };
    const barY = a.y + ROW_H - SYMBOL / 2 - 12;
    const xs = ch.map((c) => (at[c] as Point).x);
    families.push({
      drop: [mid, { x: mid.x, y: barY }],
      bar: [
        { x: Math.min(mid.x, ...xs), y: barY },
        { x: Math.max(mid.x, ...xs), y: barY },
      ],
      stubs: xs.map((x, k) => [
        { x, y: barY },
        { x, y: (at[ch[k] as number] as Point).y - SYMBOL / 2 },
      ]),
    });
  });
  const layout: PedigreeLayout = {
    width: LAYOUT_W,
    height,
    people: at,
    couples,
    families,
    fits: true,
    why: null,
  };
  let why: string | null = null;
  if (width > LAYOUT_W) why = 'too wide';
  // Two sibling bars on one row must not run into each other.
  for (let i = 0; i < families.length; i++)
    for (let j = i + 1; j < families.length; j++) {
      const A = families[i]?.bar as [Point, Point];
      const B = families[j]?.bar as [Point, Point];
      if (A[0].y === B[0].y && A[0].x <= B[1].x + 6 && B[0].x <= A[1].x + 6) why ??= 'bars meet';
    }
  return why === null ? layout : { ...layout, fits: false, why };
}

// ─────────────── Automat (#256) ───────────────

export const STATE_R = 16;

export type AutomatonLayout = {
  width: number;
  height: number;
  states: Point[];
  /** Quadratic curves from → to with control point `via`; a loop is drawn from its own points. */
  moves: { from: Point; via: Point; to: Point; label: Rect & { text: string }; loop: boolean }[];
  start: { from: Point; to: Point };
  fits: boolean;
  why: string | null;
};

export function automatonLayout(fig: AutomatonFigure): AutomatonLayout {
  const n = fig.states.length;
  const left = 30;
  const right = LAYOUT_W - STATE_R - 6;
  const pitch = n === 1 ? 0 : (right - left - STATE_R) / (n - 1);
  // Room above and below for the arcs: the farthest jump decides.
  const span = (m: { from: number; to: number }) => Math.abs(m.to - m.from);
  const bulge = (m: { from: number; to: number }) =>
    span(m) <= 1 && !fig.moves.some((o) => o.from === m.to && o.to === m.from)
      ? 0
      : 14 + 14 * span(m);
  const upMax = Math.max(26, ...fig.moves.filter((m) => m.to > m.from).map(bulge));
  const downMax = Math.max(18, ...fig.moves.filter((m) => m.to < m.from).map(bulge));
  const loops = fig.moves.some((m) => m.to === m.from);
  const top = Math.max(upMax, loops ? 44 : 0) + 18;
  const cy = top;
  const states = fig.states.map((_, i) => ({ x: left + STATE_R + i * pitch, y: cy }));
  const height = cy + STATE_R + downMax + 20;
  const moves: AutomatonLayout['moves'] = fig.moves.map((m) => {
    const A = states[m.from] as Point;
    const B = states[m.to] as Point;
    const lw = textWidth(m.syms) + 8;
    if (m.from === m.to) {
      // A loop above the state.
      const from = { x: A.x - 8, y: A.y - STATE_R + 2 };
      const to = { x: A.x + 8, y: A.y - STATE_R + 2 };
      const via = { x: A.x, y: A.y - STATE_R - 38 };
      return {
        from,
        via,
        to,
        label: { x: A.x - lw / 2, y: A.y - STATE_R - 44, w: lw, h: 14, text: m.syms },
        loop: true,
      };
    }
    const forward = m.to > m.from;
    const b = bulge(m);
    const sign = forward ? -1 : 1;
    const dir = Math.sign(B.x - A.x);
    const lift = b === 0 ? 0 : 0.6;
    const from = {
      x: A.x + dir * STATE_R * Math.cos(lift),
      y: A.y + sign * STATE_R * Math.sin(lift),
    };
    const to = {
      x: B.x - dir * STATE_R * Math.cos(lift),
      y: B.y + sign * STATE_R * Math.sin(lift),
    };
    const via = { x: (from.x + to.x) / 2, y: A.y + sign * 2 * b };
    // The apex of the curve is halfway to the control point.
    const apexY = (from.y + to.y) / 4 + via.y / 2;
    const ly = b === 0 ? A.y - 16 : forward ? apexY - 15 : apexY + 1;
    return {
      from,
      via,
      to,
      label: { x: via.x - lw / 2, y: ly, w: lw, h: 14, text: m.syms },
      loop: false,
    };
  });
  const s0 = states[0] as Point;
  const layout: AutomatonLayout = {
    width: LAYOUT_W,
    height,
    states,
    moves,
    start: { from: { x: s0.x - STATE_R - 22, y: s0.y }, to: { x: s0.x - STATE_R, y: s0.y } },
    fits: true,
    why: null,
  };
  let why: string | null = null;
  if (pitch < 2 * STATE_R + 18) why = 'states too close';
  const labels = moves.map((m) => m.label);
  const circles = states.map((p) => ({
    x: p.x - STATE_R,
    y: p.y - STATE_R,
    w: 2 * STATE_R,
    h: 2 * STATE_R,
  }));
  for (const l of labels) {
    if (!inside(l, LAYOUT_W, height)) why ??= 'label outside';
    for (const c of circles) if (overlaps(l, c, 1)) why ??= 'label on a state';
  }
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (overlaps(labels[i] as Rect, labels[j] as Rect, 1)) why ??= 'labels overlap';
  return why === null ? layout : { ...layout, fits: false, why };
}
