// Nets of solids (#368, the rest of #255): a cuboid's cross, a prism's strip of side faces with
// its two bases, a pyramid's base with a triangle on every edge, a cylinder's rectangle with two
// circles, a cone's sector with its circle. Drawn from the same kind and measures as the solid's
// Schrägbild (`solids.ts`, `w` "net"), so every key — faces, volume, surface area, which solid it
// folds into — is the solid's own, computed there. Cube nets that may or may not fold stay
// `space.ts`'s.
//
// Units as in `solids.ts`, y downwards. Every face is a closed polygon (`faces`, filled by the
// app), every edge a stroke; the measures stand where a schoolbook writes them.

import {
  arc,
  basePolygon2d,
  boxSides,
  edgeLength,
  mid,
  slantHeight,
  writtenSides,
  type BasePoint,
  type Solid,
  type SolidDrawing,
  type SolidLabel,
  type SolidXY,
} from './solids.js';

const ring = (pts: readonly SolidXY[]) => ({ pts: [...pts, pts[0]!], hidden: false });

function rect(x: number, y: number, w: number, h: number): SolidXY[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

/** A circle (or an arc of it) as points, the way the Schrägbild draws its curves (`arc`). */
function circlePts(cx: number, cy: number, r: number, from = 0, to = 2 * Math.PI): SolidXY[] {
  return arc((t) => ({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }), from, to, false).pts;
}

/** The drawing of a net: its faces as polygons, every edge, the measures. */
function drawing(faces: SolidXY[][], labels: SolidLabel[], extra: SolidXY[][] = []): SolidDrawing {
  return {
    strokes: [...faces.map(ring), ...extra.map((pts) => ({ pts, hidden: true }))],
    labels,
    dots: [],
    faces,
  };
}

/**
 * A base polygon laid against the segment (0, y0)–(len, y0): rotated so its first edge lies on
 * it, on the side away from `+side` (−1 above, 1 below).
 */
function attach(poly: readonly SolidXY[], y0: number, side: 1 | -1): SolidXY[] {
  const p0 = poly[0]!;
  const p1 = poly[1]!;
  const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const turned = poly.map((p) => {
    const x = p.x - p0.x;
    const y = p.y - p0.y;
    return { x: x * cos - y * sin, y: x * sin + y * cos };
  });
  const centre = turned.reduce((s, p) => s + p.y, 0) / turned.length;
  const flip = Math.sign(centre) === side ? 1 : -1;
  return turned.map((p) => ({ x: p.x, y: y0 + flip * p.y }));
}

/**
 * The base's corners from its base line on: its first side then lies on the strip of side faces,
 * and the base, which lies wholly on one side of that line, stands clear of the strip — an L's
 * inner corner never comes first (#418).
 */
function fromBaseLine(g: readonly BasePoint[]): BasePoint[] {
  const low = Math.min(...g.map((p) => p.y));
  const i = g.findIndex((p, k) => p.y === low && g[(k + 1) % g.length]!.y === low);
  return [...g.slice(i), ...g.slice(0, i)];
}

/** The net of a solid that holds (`solidProblem`), in its own units. A sphere has none. */
export function solidNet(s: Solid): SolidDrawing | null {
  const { a, h, r } = s;
  switch (s.k) {
    case 'cube':
    case 'cuboid': {
      const [w, d, t] = boxSides(s);
      const faces = [
        rect(d, 0, w, d),
        rect(d, d, w, t),
        rect(d, d + t, w, d),
        rect(d, 2 * d + t, w, t),
        rect(0, d, d, t),
        rect(d + w, d, d, t),
      ];
      const labels: SolidLabel[] = [{ at: { x: d + w / 2, y: 0 }, dx: 0, dy: -1, v: w }];
      if (s.k === 'cuboid') {
        labels.push({ at: { x: d / 2, y: d }, dx: 0, dy: -1, v: d });
        labels.push({ at: { x: 0, y: d + t / 2 }, dx: -1, dy: 0, v: t });
      }
      return drawing(faces, labels);
    }
    case 'prism': {
      const base = fromBaseLine(basePolygon2d(s));
      const edges = base.map((p, i) => edgeLength(p, base[(i + 1) % base.length]!));
      // A regular base names its side once; an irregular one the sides its Schrägbild writes.
      const written = (s.g?.length ?? 0) > 0 ? writtenSides(base) : [0];
      const top = attach(base, 0, -1);
      const above = -Math.min(...top.map((p) => p.y));
      const lifted = top.map((p) => ({ x: p.x, y: p.y + above }));
      const faces: SolidXY[][] = [lifted];
      let x = 0;
      const labels: SolidLabel[] = [];
      edges.forEach((e, i) => {
        faces.push(rect(x, above, e, h));
        if (written.includes(i))
          labels.push({
            at: { x: x + e / 2, y: above + h },
            dx: 0,
            dy: 1,
            v: e,
            on: [
              { x, y: above + h },
              { x: x + e, y: above + h },
            ],
          });
        x += e;
      });
      faces.push(lifted.map((p) => ({ x: p.x, y: 2 * above + h - p.y })));
      labels.push({ at: { x: x, y: above + h / 2 }, dx: 1, dy: 0, v: h });
      return drawing(faces, labels);
    }
    case 'pyramid': {
      const base = basePolygon2d(s);
      const hs = slantHeight(s);
      const cx = base.reduce((t, p) => t + p.x, 0) / base.length;
      const cy = base.reduce((t, p) => t + p.y, 0) / base.length;
      const faces: SolidXY[][] = [base];
      let apex0: SolidXY = { x: 0, y: 0 };
      base.forEach((p, i) => {
        const q = base[(i + 1) % base.length]!;
        const m = mid(p, q);
        const len = Math.hypot(m.x - cx, m.y - cy) || 1;
        const apex = { x: m.x + ((m.x - cx) / len) * hs, y: m.y + ((m.y - cy) / len) * hs };
        if (i === 0) apex0 = apex;
        faces.push([p, q, apex]);
      });
      const m0 = mid(base[0]!, base[1]!);
      const labels: SolidLabel[] = [
        { at: m0, dx: 0, dy: -1, v: a },
        { at: mid(m0, apex0), dx: 1, dy: 0, v: hs, on: [m0, apex0] },
      ];
      return drawing(faces, labels, [[m0, apex0]]);
    }
    case 'cylinder': {
      const len = 2 * Math.PI * r;
      const faces = [
        circlePts(len / 2, r, r),
        rect(0, 2 * r, len, h),
        circlePts(len / 2, 2 * r + h + r, r),
      ];
      const labels: SolidLabel[] = [
        { at: { x: len / 2 + r / 2, y: r }, dx: 0, dy: -1, v: r },
        { at: { x: 0, y: 2 * r + h / 2 }, dx: -1, dy: 0, v: h },
      ];
      return drawing(faces, labels, [
        [
          { x: len / 2, y: r },
          { x: len / 2 + r, y: r },
        ],
      ]);
    }
    case 'cone': {
      const side = Math.hypot(r, h);
      const angle = (2 * Math.PI * r) / side;
      const from = Math.PI / 2 - angle / 2;
      const arc = circlePts(0, 0, side, from, from + angle);
      const sector = [{ x: 0, y: 0 }, ...arc];
      const faces = [sector, circlePts(0, side + r, r)];
      const labels: SolidLabel[] = [
        { at: mid({ x: 0, y: 0 }, arc[0]!), dx: 1, dy: 0, v: side, on: [{ x: 0, y: 0 }, arc[0]!] },
        { at: { x: r / 2, y: side + r }, dx: 0, dy: -1, v: r },
      ];
      return drawing(faces, labels, [
        [
          { x: 0, y: side + r },
          { x: r, y: side + r },
        ],
      ]);
    }
    case 'sphere':
      return null;
  }
}
