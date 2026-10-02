// A structural formula (issue #253): Lewis, Valenzstrich or skeletal, drawn from the atoms and
// bonds of `MoleculeFigure`. Nothing here decides chemistry — the lone pairs and the layout come
// from packages/shared-math/src/molecule.ts, the same code that checked the molecule on the
// server, so the app draws exactly what was checked.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import type { ReactNode } from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';

// Imported by path, like expression.js in FigureView: dependency-free, no mathjs in the bundle.
import { layoutMolecule, type LaidAtom } from '../../../../packages/shared-math/src/molecule.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, HaloText } from './figureText.js';

type MoleculeFig = Extract<Figure, { type: 'molecule' }>;

/** The element letters: large enough to read a subscript at 360 px. */
const ATOM_FONT = 17;
/** Half a letter's width at that size — how far a bond stops short of a written atom. */
const LETTER = ATOM_FONT * 0.33;

function chargeText(c: number): string {
  if (c === 0) return '';
  const size = Math.abs(c) === 1 ? '' : String(Math.abs(c));
  return `${size}${c > 0 ? '+' : '−'}`;
}

export function MoleculeView({ fig, width }: { fig: MoleculeFig; width: number }) {
  const { palette, figure: ink } = useTheme();
  const layout = layoutMolecule(fig, fig.style);
  // The server never stores a molecule it could not lay out; an old or foreign row that slips
  // through draws nothing rather than atoms on top of each other.
  if (!layout) return null;
  const spanX = layout.maxX - layout.minX;
  const spanY = layout.maxY - layout.minY;
  const margin = 26;
  const maxH = Math.min(280, width * 0.8);
  // A bond is 30–58 px: shorter and the letters touch, longer and a small molecule looks lost.
  const bond = Math.max(
    30,
    Math.min(58, (width - 2 * margin) / (spanX || 1), (maxH - 2 * margin) / (spanY || 1)),
  );
  const w = width;
  const h = Math.round(spanY * bond + 2 * margin);
  const offX = (w - spanX * bond) / 2;
  const X = (x: number) => offX + (x - layout.minX) * bond;
  const Y = (y: number) => margin + (layout.maxY - y) * bond;
  const byKey = new Map(layout.atoms.map((a) => [a.key, a]));
  const marked = new Set(fig.mark);
  // A drawn hydrogen belongs to the group of its heteroatom (the H of an OH group).
  const isMarked = (a: LaidAtom) =>
    marked.has(a.key) ||
    (a.key !== a.of && marked.has(a.of) && fig.atoms.find((x) => x.id === a.of)?.el !== 'C');
  const accent = ink.point;

  const nodes: ReactNode[] = [];
  // ── highlight under a marked group ──
  for (const a of layout.atoms) {
    if (!isMarked(a)) continue;
    nodes.push(
      <Circle
        key={`m${a.key}`}
        cx={X(a.x)}
        cy={Y(a.y)}
        r={15}
        fill={ink.fillSoft}
        stroke={accent}
        strokeWidth={1}
        strokeDasharray="3 3"
      />,
    );
  }
  // ── bonds ──
  layout.bonds.forEach((b, i) => {
    const p = byKey.get(b.from);
    const q = byKey.get(b.to);
    if (!p || !q) return;
    let x1 = X(p.x);
    let y1 = Y(p.y);
    let x2 = X(q.x);
    let y2 = Y(q.y);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    // Stop short of a written atom so the line never runs into its letter.
    const gap = (a: LaidAtom) => (a.text ? LETTER + 5 : 0);
    x1 += ux * gap(p);
    y1 += uy * gap(p);
    x2 -= ux * gap(q);
    y2 -= uy * gap(q);
    const nx = -uy;
    const ny = ux;
    const both = isMarked(p) && isMarked(q);
    const color = both ? accent : ink.stroke;
    const stroke = {
      stroke: color,
      strokeWidth: both ? 2.25 : 1.75,
      strokeLinecap: 'round' as const,
    };
    const lines: [number, number, number, number][] = [];
    if (b.order === 1) lines.push([x1, y1, x2, y2]);
    else if (b.order === 2 && b.ring && !p.text && !q.text) {
      // A ring double bond: the ring line plus a shorter one inside the ring.
      lines.push([x1, y1, x2, y2]);
      const cx = X(b.ring.x);
      const cy = Y(b.ring.y);
      const side = (cx - (x1 + x2) / 2) * nx + (cy - (y1 + y2) / 2) * ny > 0 ? 1 : -1;
      const off = 6 * side;
      const trim = len * 0.16;
      lines.push([
        x1 + nx * off + ux * trim,
        y1 + ny * off + uy * trim,
        x2 + nx * off - ux * trim,
        y2 + ny * off - uy * trim,
      ]);
    } else {
      const offs = b.order === 2 ? [-3, 3] : [-4.5, 0, 4.5];
      for (const o of offs) lines.push([x1 + nx * o, y1 + ny * o, x2 + nx * o, y2 + ny * o]);
    }
    lines.forEach(([a1, b1, a2, b2], k) =>
      nodes.push(<Line key={`b${i}-${k}`} x1={a1} y1={b1} x2={a2} y2={b2} {...stroke} />),
    );
  });
  // ── lone pairs: dots (Lewis) or bars (Valenzstrich) ──
  for (const a of layout.atoms) {
    a.lonePairs.forEach((dir, k) => {
      const dx = Math.cos(dir);
      const dy = -Math.sin(dir); // the layout's y is up, the screen's is down
      const r = 14;
      const cx = X(a.x) + dx * r;
      const cy = Y(a.y) + dy * r;
      const px = -dy;
      const py = dx;
      if (fig.style === 'lewis') {
        nodes.push(
          <G key={`lp${a.key}-${k}`}>
            <Circle cx={cx + px * 3.2} cy={cy + py * 3.2} r={1.9} fill={palette.ink} />
            <Circle cx={cx - px * 3.2} cy={cy - py * 3.2} r={1.9} fill={palette.ink} />
          </G>,
        );
      } else {
        nodes.push(
          <Line
            key={`lp${a.key}-${k}`}
            x1={cx + px * 6}
            y1={cy + py * 6}
            x2={cx - px * 6}
            y2={cy - py * 6}
            stroke={palette.ink}
            strokeWidth={1.75}
            strokeLinecap="round"
          />,
        );
      }
    });
  }
  // ── atoms ──
  const letters: ReactNode[] = [];
  for (const a of layout.atoms) {
    const x = X(a.x);
    const y = Y(a.y);
    const color = isMarked(a) ? accent : palette.ink;
    if (a.text) {
      // The element letter sits on the atom; hydrogens written with it hang off to one side.
      const el = a.el;
      const before = a.text.endsWith(el) && a.text !== el;
      const after = a.text.startsWith(el) && a.text !== el;
      const anchor = before ? 'end' : after ? 'start' : 'middle';
      const shift = before ? LETTER * el.length : after ? -LETTER * el.length : 0;
      letters.push(
        <HaloText
          key={`t${a.key}`}
          x={x + shift}
          y={y + ATOM_FONT * 0.36}
          size={ATOM_FONT}
          weight="600"
          color={color}
          anchor={anchor}
          text={a.text}
        />,
      );
    }
    const c = chargeText(a.charge);
    if (c) {
      letters.push(
        <HaloText
          key={`c${a.key}`}
          x={
            x +
            (a.text
              ? LETTER * (a.text.length > 1 && !a.text.endsWith(a.el) ? 2 * a.text.length - 1 : 1) +
                4
              : 7)
          }
          y={y - 8}
          size={13}
          color={color}
          anchor="start"
          text={c}
        />,
      );
    }
  }
  return (
    <Svg width={w} height={h} fontFamily={FAMILY}>
      {nodes}
      {letters}
    </Svg>
  );
}
