// Itten's colour wheel (issue #261): twelve fields clockwise from yellow at the top, and in the
// middle Itten's star — the three primaries as a triangle, the three secondaries around it. Every
// field carries its name in words next to it, so colour is never the only signal; a marked field
// has a heavy outline and its name in bold. The twelve tones are theme tokens with their own dark
// variants (`figure.hues`, lib/theme/palettes.ts), so they stay apart on a dark card too.
// Nothing here decides anything: which field is opposite, between or primary is
// packages/shared-math/src/itten.ts, the same code that checked the question on the server.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { useTranslation } from 'react-i18next';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

// Imported by path, like every figure file: dependency-free, the server's own rules.
import { TICK_FONT } from '../../../../packages/shared-math/src/charts.js';
import { textWidth } from '../../../../packages/shared-math/src/labelBoxes.js';
import { ITTEN_HUES, type Hue } from '../../../../packages/shared-math/src/itten.js';
import type { Translate } from '../../lib/i18n/index.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY } from './figureText.js';

export type ColorWheelFig = Extract<Figure, { type: 'color_wheel' }>;
type XY = { x: number; y: number };

/** The wheel's radius at most, its ring's share of it, and its labels' line height and gap. */
const MAX_R = 78;
const MIN_R = 44;
const RING = 0.38;
const LINE = 13;
const GAP = 5;
const EDGE = 2;

/** A field's name in one or two lines: a compound breaks after its hyphen or space. */
export function hueLines(name: string): string[] {
  const at = name.search(/[- ]/);
  if (at <= 0) return [name];
  return [name.slice(0, at + 1).trim(), name.slice(at + 1)];
}

type Box = { x0: number; x1: number; y0: number; y1: number };
type Placed = {
  lines: string[];
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  box: Box;
};

const angleOf = (k: number) => (k * Math.PI) / 6;
const onCircle = (c: XY, r: number, a: number): XY => ({
  x: c.x + r * Math.sin(a),
  y: c.y - r * Math.cos(a),
});

/** Where field k's name stands outside a wheel of radius r round c: its first baseline, its box. */
function placeLabel(lines: string[], c: XY, r: number, k: number): Placed {
  const a = angleOf(k);
  const p = onCircle(c, r + GAP, a);
  const sin = Math.sin(a);
  const anchor = Math.abs(sin) < 0.3 ? 'middle' : sin > 0 ? 'start' : 'end';
  const w = Math.max(...lines.map((l) => textWidth(l, TICK_FONT)));
  const h = lines.length * LINE;
  const top = Math.cos(a) > 0.9 ? p.y - h : Math.cos(a) < -0.9 ? p.y : p.y - h / 2;
  const x0 = anchor === 'start' ? p.x : anchor === 'end' ? p.x - w : p.x - w / 2;
  return {
    lines,
    x: p.x,
    y: top + LINE - 3,
    anchor,
    box: { x0, x1: x0 + w, y0: top, y1: top + h },
  };
}

export type WheelLayout = { center: XY; r: number; labels: Placed[]; height: number };

/**
 * The wheel at `width`: the largest radius whose twelve names all stand inside the width, and
 * the height that holds them. Null when even the smallest wheel cannot hold them.
 */
export function wheelLayout(names: string[], width: number): WheelLayout | null {
  const lines = names.map(hueLines);
  for (let r = MAX_R; r >= MIN_R; r -= 2) {
    const c = { x: width / 2, y: 0 };
    const labels = lines.map((l, k) => placeLabel(l, c, r, k));
    const fits = labels.every((p) => p.box.x0 >= EDGE && p.box.x1 <= width - EDGE);
    if (!fits) continue;
    const top = Math.min(-r, ...labels.map((p) => p.box.y0)) - EDGE;
    const bottom = Math.max(r, ...labels.map((p) => p.box.y1)) + EDGE;
    const center = { x: c.x, y: -top };
    const shifted = lines.map((l, k) => placeLabel(l, center, r, k));
    return { center, r, labels: shifted, height: Math.ceil(bottom - top) };
  }
  return null;
}

/** An annular sector: field k of the ring between r0 and r1. */
function sector(c: XY, r0: number, r1: number, k: number): string {
  const a0 = angleOf(k) - Math.PI / 12;
  const a1 = angleOf(k) + Math.PI / 12;
  const [p0, p1, p2, p3] = [
    onCircle(c, r1, a0),
    onCircle(c, r1, a1),
    onCircle(c, r0, a1),
    onCircle(c, r0, a0),
  ];
  return `M${p0.x},${p0.y} A${r1},${r1} 0 0 1 ${p1.x},${p1.y} L${p2.x},${p2.y} A${r0},${r0} 0 0 0 ${p3.x},${p3.y} Z`;
}

const polygon = (ps: XY[]) => `M${ps.map((p) => `${p.x},${p.y}`).join(' L')} Z`;
const mid = (a: XY, b: XY): XY => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Itten's star: the primaries as three kites of one triangle, a secondary on each side. */
function star(c: XY, h: number): { hue: number; d: string }[] {
  const v = (k: number) => onCircle(c, h, angleOf(k));
  const [y, r, b] = [v(0), v(4), v(8)];
  return [
    { hue: 0, d: polygon([y, mid(y, r), c, mid(b, y)]) },
    { hue: 4, d: polygon([r, mid(r, b), c, mid(y, r)]) },
    { hue: 8, d: polygon([b, mid(b, y), c, mid(r, b)]) },
    { hue: 2, d: polygon([y, v(2), r]) },
    { hue: 6, d: polygon([r, v(6), b]) },
    { hue: 10, d: polygon([b, v(10), y]) },
  ];
}

export function ColorWheelBody({ figure, width }: { figure: ColorWheelFig; width: number }) {
  const { figure: ink } = useTheme();
  const { t } = useTranslation('math');
  const names = ITTEN_HUES.map((h) => t(`figure.hue_${h}`));
  const layout = wheelLayout(names, width);
  if (!layout) return null;
  const { center: c, r } = layout;
  const inner = r * (1 - RING);
  const marked = new Set<Hue>(figure.hl);
  return (
    <Svg width={width} height={layout.height}>
      {ITTEN_HUES.map((hue, k) => (
        <Path
          key={hue}
          d={sector(c, inner, r, k)}
          fill={ink.hues[k]}
          stroke={ink.paper}
          strokeWidth={1.5}
        />
      ))}
      {star(c, inner - 5).map((s) => (
        <Path key={s.hue} d={s.d} fill={ink.hues[s.hue]} stroke={ink.paper} strokeWidth={1.5} />
      ))}
      {/* The marked fields: a heavy outline over the separators, and the name in bold below. */}
      {ITTEN_HUES.map((hue, k) =>
        marked.has(hue) ? (
          <Path
            key={`m-${hue}`}
            d={sector(c, inner, r, k)}
            fill="none"
            stroke={ink.stroke}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
        ) : null,
      )}
      {layout.labels.map((label, k) => {
        const bold = marked.has(ITTEN_HUES[k]!);
        return (
          <G key={k}>
            {label.lines.map((line, j) => (
              <SvgText
                key={j}
                fontFamily={FAMILY}
                x={label.x}
                y={label.y + j * LINE}
                fontSize={TICK_FONT}
                fontWeight={bold ? '700' : '400'}
                fill={bold ? ink.stroke : ink.label}
                textAnchor={label.anchor}
              >
                {line}
              </SvgText>
            ))}
          </G>
        );
      })}
    </Svg>
  );
}

/** The wheel in words: its twelve fields in order, Itten's star, and which fields are marked. */
export function describeColorWheel(figure: ColorWheelFig, t: Translate): string {
  const name = (h: Hue) => t(`figure.hue_${h}`);
  const parts = [
    t('figure.wheel', { fields: ITTEN_HUES.map(name).join(', ') }),
    t('figure.wheel_star', {
      primaries: (['yellow', 'red', 'blue'] as const).map(name).join(', '),
      secondaries: (['orange', 'violet', 'green'] as const).map(name).join(', '),
    }),
  ];
  if (figure.hl.length > 0)
    parts.push(t('figure.wheel_marked', { fields: figure.hl.map(name).join(', ') }));
  return parts.join('. ');
}
