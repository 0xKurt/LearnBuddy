// Every measure on a solid or a net stands clear (#418): no label on a line — drawn or dashed —
// and none on another label, at the widths a 360 and a 390 phone give the drawing.

import { describe, expect, it } from 'vitest';

import {
  crosses,
  grow,
  overlaps,
  textWidth,
  type Rect,
} from '../../../../../packages/shared-math/src/labelBoxes.js';
import { solidNet } from '../../../../../packages/shared-math/src/solidNets.js';
import { solidDrawing, type Solid } from '../../../../../packages/shared-math/src/solids.js';
import { solidLayout, type SolidLabelSpot } from '../solidLayout.js';

const SIZE = 14;
/**
 * The drawing's width inside the question card on a 360 and a 390 phone, a wider one, and the
 * narrower ones the card draws it at when it shrinks it into less room (FigureView).
 */
const WIDTHS = [160, 200, 240, 276, 290, 306, 320, 340];

const solid = (k: Solid['k'], m: Partial<Solid>, w: Solid['w'] = 'oblique'): Solid => ({
  type: 'solid',
  k,
  n: 0,
  a: 0,
  b: 0,
  h: 0,
  r: 0,
  u: 'cm',
  ask: 'volume',
  g: [],
  w,
  ...m,
});
const lying = (g: Array<[number, number]>, h: number, w: Solid['w'] = 'oblique') =>
  solid('prism', { n: g.length, h, g: g.map(([x, y]) => ({ x, y })) }, w);

/** The figures of the walkthrough and their siblings. */
const FIGURES: Array<[string, Solid]> = [
  [
    'trapezoid prism',
    lying(
      [
        [0, 0],
        [6, 0],
        [4, 3],
        [2, 3],
      ],
      5,
    ),
  ],
  [
    'triangle prism',
    lying(
      [
        [0, 0],
        [4, 0],
        [0, 3],
      ],
      10,
    ),
  ],
  [
    'isosceles prism',
    lying(
      [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
      5,
    ),
  ],
  ['cuboid', solid('cuboid', { a: 5, b: 3, h: 2 })],
  ['cuboid net', solid('cuboid', { a: 5, b: 3, h: 2 }, 'net')],
  ['cube net', solid('cube', { a: 3 }, 'net')],
  ['cylinder net', solid('cylinder', { r: 2, h: 5 }, 'net')],
  ['cone net', solid('cone', { r: 3, h: 4 }, 'net')],
  ['pyramid net', solid('pyramid', { n: 4, a: 6, h: 4 }, 'net')],
  ['prism net', solid('prism', { n: 6, a: 2, h: 4 }, 'net')],
  [
    'triangle prism net',
    lying(
      [
        [0, 0],
        [4, 0],
        [0, 3],
      ],
      6,
      'net',
    ),
  ],
  ['pyramid', solid('pyramid', { n: 4, a: 6, h: 4 })],
  ['cylinder', solid('cylinder', { r: 3, h: 5 })],
  ['cone', solid('cone', { r: 3, h: 8 })],
];

/** The box a label's text covers: its width at `SIZE`, from the cap height to the baseline. */
function textBox(spot: SolidLabelSpot, text: string): Rect {
  const w = textWidth(text, SIZE);
  return { x: spot.x - w / 2, y: spot.y - 0.75 * SIZE, w, h: 0.8 * SIZE };
}

/** What each label covers that it must not, at this width. */
function clashes(s: Solid, width: number): string[] {
  const drawing = (s.w === 'net' ? solidNet(s) : null) ?? solidDrawing(s);
  const text = (v: number) => `${v} ${s.u}`;
  const layout = solidLayout(drawing, drawing.labels, text, width, SIZE);
  const texts = drawing.labels.map((l) => text(l.v));
  const boxes = layout.spots.map((spot, i) => grow(textBox(spot, texts[i]!), 1));
  const out: string[] = [];
  // The drawing's lines and the dimension lines a height may have got (#424).
  const lines = [
    ...drawing.strokes.map((st) => st.pts.map(layout.at)),
    ...layout.dimensions.flatMap((d) => (d === null ? [] : d.lines)),
  ];
  boxes.forEach((box, i) => {
    lines.forEach((pts, j) => {
      if (pts.some((p, k) => k > 0 && crosses(pts[k - 1]!, p, box)))
        out.push(`"${texts[i]}" on line ${j}`);
    });
    boxes.forEach((other, j) => {
      if (j > i && overlaps(box, other)) out.push(`"${texts[i]}" on "${texts[j]}"`);
    });
    if (box.x < 0 || box.x + box.w > width || box.y < 0 || box.y + box.h > layout.height)
      out.push(`"${texts[i]}" off the drawing`);
  });
  return out;
}

/** Is the point inside the polygon (even-odd)? */
function inside(p: { x: number; y: number }, poly: readonly { x: number; y: number }[]): boolean {
  let hit = false;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y))
      hit = !hit;
  });
  return hit;
}

/** Slim solids whose height has no room inside at a small size (#424). */
const SLIM: Array<[string, Solid]> = [
  ['cone', solid('cone', { r: 3, h: 8 })],
  ['slim cone', solid('cone', { r: 2, h: 9 })],
  ['pyramid', solid('pyramid', { n: 4, a: 6, h: 4 })],
  ['slim pyramid', solid('pyramid', { n: 4, a: 3, h: 8 })],
  [
    'isosceles prism',
    lying(
      [
        [0, 0],
        [4, 0],
        [2, 3],
      ],
      5,
    ),
  ],
  [
    'slim prism',
    lying(
      [
        [0, 0],
        [2, 0],
        [1, 6],
      ],
      3,
    ),
  ],
];

describe('the height of a slim solid (#424)', () => {
  it.each(SLIM)(
    'stands inside the %s, or at a dimension line outside it — never beside a slant',
    (_, s) => {
      for (const width of WIDTHS) {
        const drawing = solidDrawing(s);
        const text = (v: number) => `${v} ${s.u}`;
        const layout = solidLayout(drawing, drawing.labels, text, width, SIZE);
        drawing.labels.forEach((l, i) => {
          if (!l.height || !l.in) return;
          const spot = layout.spots[i]!;
          const middle = { x: spot.x, y: spot.y - 0.35 * SIZE };
          const placed = inside(middle, l.in.map(layout.at)) || layout.dimensions[i] !== null;
          expect(placed, `${text(l.v)} at ${width}`).toBe(true);
        });
        expect(clashes(s, width), `at ${width}`).toEqual([]);
      }
    },
  );

  it('draws the dimension line as the schoolbook does: two extension lines and a double arrow', () => {
    const s = solid('cone', { r: 3, h: 8 });
    const drawing = solidDrawing(s);
    const layout = solidLayout(drawing, drawing.labels, (v) => `${v} cm`, 160, SIZE);
    const i = drawing.labels.findIndex((l) => l.height);
    const d = layout.dimensions[i]!;
    expect(d).not.toBeNull();
    // Two extension lines, the dimension line itself, an arrow at each end.
    expect(d.lines).toHaveLength(3);
    expect(d.arrows).toHaveLength(2);
    // Outside the cone: the dimension line beside the whole drawing, on one side or the other.
    const xs = drawing.strokes.flatMap((st) => st.pts.map((p) => layout.at(p).x));
    const line = d.lines[2]!.map((p) => p.x);
    expect(Math.min(...line) > Math.max(...xs) || Math.max(...line) < Math.min(...xs)).toBe(true);
  });
});

describe('solidLayout (#418)', () => {
  it.each(FIGURES)('writes every measure of the %s clear of lines and labels', (_, s) => {
    for (const width of WIDTHS) expect(clashes(s, width), `at ${width}`).toEqual([]);
  });

  it('draws a net as large as its room: the cylinder’s, no longer a third of the card', () => {
    const s = solid('cylinder', { r: 2, h: 5 }, 'net');
    const drawing = solidNet(s)!;
    const layout = solidLayout(drawing, drawing.labels, (v) => `${v} cm`, 290, SIZE);
    const xs = drawing.strokes.flatMap((st) => st.pts.map((p) => layout.at(p).x));
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.6 * 290);
    // Its height still follows its width, so the card can shrink it in step.
    expect(layout.height).toBeLessThanOrEqual(0.85 * 290 + 1);
  });
});
