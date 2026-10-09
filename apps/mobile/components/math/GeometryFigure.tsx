// A geometry drawing (FigureView, `geometry`): points with their names, segments, polygons,
// circles, angles (a right angle as a square with a dot), measures beside the sides, lines that
// run to the edge, rays and light rays, force arrows and their resultant — scaled to fit, every
// label kept whole inside the drawing.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Path, Polygon } from 'react-native-svg';

import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FONT, formatNumber, HaloText } from './figureText.js';

type GeometryFig = Extract<Figure, { type: 'geometry' }>;

type ScreenXY = { x: number; y: number };

/** Where a line from `p` in direction `d` leaves the drawing (inset a little from its edge). */
function toEdge(p: ScreenXY, d: ScreenXY, w: number, h: number): ScreenXY {
  const inset = 4;
  let t = Infinity;
  if (d.x > 1e-9) t = Math.min(t, (w - inset - p.x) / d.x);
  if (d.x < -1e-9) t = Math.min(t, (inset - p.x) / d.x);
  if (d.y > 1e-9) t = Math.min(t, (h - inset - p.y) / d.y);
  if (d.y < -1e-9) t = Math.min(t, (inset - p.y) / d.y);
  if (!Number.isFinite(t) || t < 0) return p;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

const unit = (from: ScreenXY, to: ScreenXY): ScreenXY => {
  const l = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / l, y: (to.y - from.y) / l };
};

/** A filled arrowhead with its tip at `tip`, pointing along `d`. */
function headPath(tip: ScreenXY, d: ScreenXY, size = 10): string {
  const back = { x: tip.x - d.x * size, y: tip.y - d.y * size };
  const n = { x: -d.y * size * 0.45, y: d.x * size * 0.45 };
  return `M${tip.x},${tip.y} L${back.x + n.x},${back.y + n.y} L${back.x - n.x},${back.y - n.y} Z`;
}

export function GeometryFigure({ fig, width }: { fig: GeometryFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const { angles, lengths, arrows, rays, lines } = fig;
  const byName = new Map(fig.points.map((p) => [p.name, p]));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const p of fig.points) extend(p.x, p.y);
  for (const c of fig.circles) {
    const p = byName.get(c.center);
    if (!p) continue;
    extend(p.x - c.radius, p.y - c.radius);
    extend(p.x + c.radius, p.y + c.radius);
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  // Room around the drawing for point names, measures and arrow labels.
  // Measures written beside the sides and arrows need more room than point names do.
  const margin = lengths.length > 0 || arrows.length > 0 || lines.length > 0 ? 42 : 30;
  const maxH = Math.min(320, width);
  const scale = Math.min((width - 2 * margin) / spanX, (maxH - 2 * margin) / spanY);
  const h = Math.round(spanY * scale + 2 * margin);
  const offX = (width - spanX * scale) / 2;
  const X = (x: number) => offX + (x - minX) * scale;
  const Y = (y: number) => margin + (maxY - y) * scale;
  const at = (n: string): ScreenXY | null => {
    const p = byName.get(n);
    return p ? { x: X(p.x), y: Y(p.y) } : null;
  };
  const cx = fig.points.reduce((s, p) => s + p.x, 0) / fig.points.length;
  const cy = fig.points.reduce((s, p) => s + p.y, 0) / fig.points.length;
  const middle = { x: X(cx), y: Y(cy) };
  /** The side of a segment that faces away from the middle of the drawing. */
  const outward = (p: ScreenXY, q: ScreenXY): ScreenXY => {
    const d = unit(p, q);
    let n = { x: -d.y, y: d.x };
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    if ((mid.x - middle.x) * n.x + (mid.y - middle.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    return n;
  };
  // A point that only marks where an arrow ends, or only gives a line (and the arm of an angle
  // on it) its direction, is no point of the figure: no dot, no name — a mirror's two ends or
  // the top of a normal would otherwise crowd the drawing with letters nobody asked about.
  const named = new Set<string>([
    ...fig.segments.flatMap((sg) => [sg.from, sg.to]),
    ...fig.polygons.flat(),
    ...fig.circles.map((c) => c.center),
    ...angles.map((a) => a.at[1] ?? ''),
    ...lengths.flatMap((l) => [l.from, l.to]),
    ...arrows.map((a) => a.from),
    ...rays.flatMap((r) => [r.from, r.through]),
  ]);
  const helpers = new Set([
    ...arrows.map((a) => a.to),
    ...lines.flatMap((l) => [l.a, l.b]),
    ...angles.flatMap((a) => [a.at[0] ?? '', a.at[2] ?? '']),
  ]);
  const tipsOnly = new Set(
    [...helpers].filter(
      (n) =>
        !named.has(n) &&
        (arrows.some((a) => a.to === n) || lines.some((l) => l.a === n || l.b === n)),
    ),
  );
  /** A measure or a name, kept whole inside the drawing (never cut at its edge). */
  const label = (key: string, x: number, y: number, text: string, color = palette.ink) => {
    const half = ((FONT + 1) * 0.6 * [...text].length) / 2 + 3;
    const cx = Math.min(Math.max(x, half), width - half);
    const cy = Math.min(Math.max(y, FONT), h - 8);
    return (
      <HaloText
        key={key}
        x={cx}
        y={cy + 5}
        size={FONT + 1}
        color={color}
        anchor="middle"
        text={text}
      />
    );
  };

  /**
   * How far a label's centre stands off a line along the normal `n`, so that the whole text —
   * not just its middle — clears the line: a wide "F₂ = 40 N" beside an upright arrow needs
   * half its width, the same text above a level side only half its height.
   */
  const clear = (text: string, n: ScreenXY) =>
    8 + Math.abs(n.x) * (((FONT + 1) * 0.6 * [...text].length) / 2) + Math.abs(n.y) * 8;

  const nodes: ReactNode[] = [];
  const labels: ReactNode[] = [];
  fig.polygons.forEach((poly, i) => {
    const pts = poly.map((n) => byName.get(n)).filter((p) => p !== undefined);
    if (pts.length < 3) return;
    nodes.push(
      <Polygon
        key={`poly${i}`}
        points={pts.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}
        fill={ink.fillSoft}
        stroke={ink.stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />,
    );
  });
  fig.circles.forEach((c, i) => {
    const p = byName.get(c.center);
    if (!p) return;
    nodes.push(
      <Circle
        key={`c${i}`}
        cx={X(p.x)}
        cy={Y(p.y)}
        r={c.radius * scale}
        fill="none"
        stroke={ink.stroke}
        strokeWidth={1.75}
      />,
    );
  });
  lines.forEach((l, i) => {
    const p = at(l.a);
    const q = at(l.b);
    if (!p || !q) return;
    const d = unit(p, q);
    const end1 = toEdge(p, d, width, h);
    const end2 = toEdge(p, { x: -d.x, y: -d.y }, width, h);
    nodes.push(
      <Line
        key={`l${i}`}
        x1={end1.x}
        y1={end1.y}
        x2={end2.x}
        y2={end2.y}
        stroke={ink.axis}
        strokeWidth={1.5}
      />,
    );
    if (l.label) {
      const n = outward(end2, end1);
      const off = clear(l.label, n);
      const spot = { x: end1.x - d.x * 18 + n.x * off, y: end1.y - d.y * 18 + n.y * off };
      labels.push(label(`ll${i}`, spot.x, spot.y, l.label, palette.ink2));
    }
  });
  fig.segments.forEach((seg, i) => {
    const p = at(seg.from);
    const q = at(seg.to);
    if (!p || !q) return;
    nodes.push(
      <Line
        key={`s${i}`}
        x1={p.x}
        y1={p.y}
        x2={q.x}
        y2={q.y}
        stroke={ink.stroke}
        strokeWidth={1.75}
        strokeLinecap="round"
      />,
    );
  });
  rays.forEach((r, i) => {
    const p = at(r.from);
    const q = at(r.through);
    if (!p || !q) return;
    const d = unit(p, q);
    // Light that falls onto a mirror or a lens ends there; every other ray runs to the edge.
    const end = r.kind === 'light_in' ? q : toEdge(p, d, width, h);
    const light = r.kind !== 'ray';
    const color = light ? ink.series[1] : ink.stroke;
    nodes.push(
      <Line
        key={`r${i}`}
        x1={p.x}
        y1={p.y}
        x2={end.x}
        y2={end.y}
        stroke={color}
        strokeWidth={light ? 2.25 : 1.75}
        strokeLinecap="round"
      />,
    );
    // A light ray carries its direction on the line, as in a physics book.
    if (light) {
      // Between its two points, clear of both: early on incoming light, late on outgoing
      // light, so neither sits on the angle values where the light meets the mirror.
      const at = r.kind === 'light_in' ? 0.4 : 0.7;
      const tip = { x: p.x + (q.x - p.x) * at + d.x * 5, y: p.y + (q.y - p.y) * at + d.y * 5 };
      nodes.push(<Path key={`rh${i}`} d={headPath(tip, d, 11)} fill={color} />);
    }
  });
  angles.forEach((a, i) => {
    const [pa, pb, pc] = a.at.map(at);
    if (!pa || !pb || !pc) return;
    const a1 = Math.atan2(pa.y - pb.y, pa.x - pb.x);
    const a2 = Math.atan2(pc.y - pb.y, pc.x - pb.x);
    let delta = a2 - a1;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    const reflex = a.deg !== null && a.deg > 180;
    const sweep = reflex ? delta - Math.sign(delta) * 2 * Math.PI : delta;
    const size = Math.abs(sweep);
    const mid = a1 + sweep / 2;
    const text = a.label ?? (a.deg !== null ? `${formatNumber(a.deg)}°` : null);
    if (a.deg === 90) {
      // A right angle is a square with a dot, never an arc.
      const s = 13;
      const u = unit(pb, pa);
      const v = unit(pb, pc);
      const c1 = { x: pb.x + u.x * s, y: pb.y + u.y * s };
      const c2 = { x: pb.x + (u.x + v.x) * s, y: pb.y + (u.y + v.y) * s };
      const c3 = { x: pb.x + v.x * s, y: pb.y + v.y * s };
      nodes.push(
        <G key={`a${i}`}>
          <Path
            d={`M${c1.x},${c1.y} L${c2.x},${c2.y} L${c3.x},${c3.y}`}
            fill="none"
            stroke={ink.point}
            strokeWidth={1.5}
          />
          <Circle
            cx={pb.x + (u.x + v.x) * s * 0.5}
            cy={pb.y + (u.y + v.y) * s * 0.5}
            r={1.8}
            fill={ink.point}
          />
        </G>,
      );
      if (a.label) {
        const r = 30;
        labels.push(
          label(`al${i}`, pb.x + Math.cos(mid) * r, pb.y + Math.sin(mid) * r, a.label, ink.point),
        );
      }
      return;
    }
    // A narrow angle gets a wider arc, so its value still fits between the arms.
    const r = size < (35 * Math.PI) / 180 ? 36 : 24;
    const start = { x: pb.x + Math.cos(a1) * r, y: pb.y + Math.sin(a1) * r };
    const end = { x: pb.x + Math.cos(a1 + sweep) * r, y: pb.y + Math.sin(a1 + sweep) * r };
    const large = size > Math.PI ? 1 : 0;
    const flag = sweep > 0 ? 1 : 0;
    nodes.push(
      <Path
        key={`a${i}`}
        d={`M${pb.x},${pb.y} L${start.x},${start.y} A${r},${r} 0 ${large} ${flag} ${end.x},${end.y} Z`}
        fill={ink.fillSoft}
        stroke="none"
      />,
      <Path
        key={`ae${i}`}
        d={`M${start.x},${start.y} A${r},${r} 0 ${large} ${flag} ${end.x},${end.y}`}
        fill="none"
        stroke={ink.point}
        strokeWidth={1.75}
      />,
    );
    if (text) {
      const lr = r + 19;
      labels.push(
        label(`al${i}`, pb.x + Math.cos(mid) * lr, pb.y + Math.sin(mid) * lr, text, ink.point),
      );
    }
  });
  lengths.forEach((l, i) => {
    const p = at(l.from);
    const q = at(l.to);
    if (!p || !q) return;
    const text = l.label ?? (l.value !== null ? formatNumber(l.value) : null);
    if (!text) return;
    const n = outward(p, q);
    const off = clear(text, n);
    const mid = { x: (p.x + q.x) / 2 + n.x * off, y: (p.y + q.y) / 2 + n.y * off };
    labels.push(label(`len${i}`, mid.x, mid.y, text));
  });
  arrows.forEach((a, i) => {
    const p = at(a.from);
    const q = at(a.to);
    if (!p || !q) return;
    const d = unit(p, q);
    const color = a.resultant ? ink.series[1] : ink.point;
    nodes.push(
      <G key={`v${i}`}>
        <Line
          x1={p.x}
          y1={p.y}
          x2={q.x - d.x * 8}
          y2={q.y - d.y * 8}
          stroke={color}
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeDasharray={a.resultant ? '7 4' : undefined}
        />
        <Path d={headPath(q, d, 11)} fill={color} />
      </G>,
    );
    const text = a.label ?? (a.value !== null ? formatNumber(a.value) : null);
    if (!text) return;
    // The name sits beside the arrow's tip half, on the side away from the middle — or, on an
    // arrow that runs (nearly) upright, beyond its tip: a name as wide as "F₂ = 40 N" beside it
    // would need more room at the edge than the drawing has.
    const n = outward(p, q);
    const upright = Math.abs(n.x) > 0.8;
    const off = clear(text, n);
    const spot = upright
      ? { x: q.x + d.x * 16, y: q.y + d.y * 16 }
      : { x: p.x + (q.x - p.x) * 0.62 + n.x * off, y: p.y + (q.y - p.y) * 0.62 + n.y * off };
    labels.push(label(`vl${i}`, spot.x, spot.y, text, color));
  });

  return (
    <Svg width={width} height={h}>
      {nodes}
      {fig.points
        .filter((p) => !tipsOnly.has(p.name))
        .map((p) => {
          // Name away from the middle of the drawing so it doesn't sit on a line.
          let dx = p.x - cx;
          let dy = p.y - cy;
          const len = Math.hypot(dx, dy);
          if (len < 1e-9) {
            dx = 0;
            dy = 1;
          } else {
            dx /= len;
            dy /= len;
          }
          const lx = X(p.x) + dx * 14;
          const ly = Y(p.y) - dy * 14 + 5;
          return (
            <G key={p.name}>
              <Circle cx={X(p.x)} cy={Y(p.y)} r={3.5} fill={ink.stroke} />
              <HaloText
                x={lx}
                y={ly}
                size={FONT + 2}
                color={palette.ink}
                anchor="middle"
                text={p.name}
              />
            </G>
          );
        })}
      {labels}
    </Svg>
  );
}
