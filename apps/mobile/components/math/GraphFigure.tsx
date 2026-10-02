// Schemata und Bäume (issues #247, #256): Kästchen mit Pfeilen, Baumdiagramm, Stammbaum und
// Automat. Gezeichnet wird, was `graphLayout.ts` rechnet — dieselbe Rechnung, mit der der Server
// vorher geprüft hat, dass die Figur auf 360 pt ohne Überlappung passt. Diese Datei legt nichts
// aus; sie malt nur.
//
// Alles in einem logischen Raum von `LAYOUT_W` Breite, auf die vorhandene Breite skaliert
// (`viewBox`), damit der Text dieselbe Größe zur Zeichnung behält, die der Server geprüft hat.

import type {
  AutomatonFigure,
  DiagramFigure,
  PedigreeFigure,
  Point,
  ProbTreeFigure,
} from '@learnbuddy/shared-types/contracts';
import {
  automatonLayout,
  diagramLayout,
  FONT,
  LAYOUT_W,
  LEGEND_FONT,
  LINE_H,
  pedigreeLayout,
  probTreeLayout,
  STATE_R,
  SYMBOL,
  TAG_R,
} from '@learnbuddy/shared-types/contracts';
import { useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { currentLocale } from '../../lib/i18n/index.js';
import { localDecimal } from '../../lib/numbers.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

/**
 * The drawing at the width it has. Never wider than 1.25× the logical width: on a tablet a
 * diagram of five boxes should not grow into a poster.
 */
function Frame({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const w = Math.min(width, LAYOUT_W * 1.25);
  const pad = 4;
  return (
    <Svg
      width={w}
      height={(w * (height + 2 * pad)) / (LAYOUT_W + 2 * pad)}
      viewBox={`${-pad} ${-pad} ${LAYOUT_W + 2 * pad} ${height + 2 * pad}`}
    >
      {children}
    </Svg>
  );
}

/** A filled triangle whose tip is at `to`, pointing away from `from`. */
function headAt(from: Point, to: Point, size = 7): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = to.x - ux * size;
  const by = to.y - uy * size;
  const half = size * 0.55;
  return `${to.x},${to.y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}`;
}

// ─────────────── Kästchen und Pfeile ───────────────

export function DiagramPicture({ fig, width }: { fig: DiagramFigure; width: number }) {
  const { palette, figure: ink } = useTheme();
  const l = useMemo(() => diagramLayout(fig), [fig]);
  if (l.boxes.length === 0) return null;
  return (
    <Frame width={width} height={l.height}>
      {l.arrows.map((a, k) => {
        // Stop the line where the head begins, so the tip is sharp.
        const dx = a.to.x - a.from.x;
        const dy = a.to.y - a.from.y;
        const len = Math.hypot(dx, dy) || 1;
        const end = { x: a.to.x - (dx / len) * 5, y: a.to.y - (dy / len) * 5 };
        return (
          <G key={`a${k}`}>
            <Line
              x1={a.from.x}
              y1={a.from.y}
              x2={end.x}
              y2={end.y}
              stroke={ink.axis}
              strokeWidth={1.6}
            />
            <Polygon points={headAt(a.from, a.to)} fill={ink.axis} />
          </G>
        );
      })}
      {l.boxes.map((b, k) => (
        <G key={`b${k}`}>
          <Rect
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={10}
            fill={b.blank ? palette.paper : palette.primaryLt}
            stroke={b.blank ? palette.primary : ink.gridStrong}
            strokeWidth={b.blank ? 1.6 : 1}
            strokeDasharray={b.blank ? '5 4' : undefined}
          />
          {b.lines.map((line, i) => (
            <SvgText
              key={i}
              x={b.x + b.w / 2}
              y={b.y + b.h / 2 + (i - (b.lines.length - 1) / 2) * LINE_H + FONT * 0.35}
              fontSize={b.blank ? FONT + 3 : FONT}
              fontWeight={b.blank ? '700' : '500'}
              fontFamily={FAMILY}
              fill={b.blank ? palette.primaryDk : palette.ink}
              textAnchor="middle"
            >
              {line}
            </SvgText>
          ))}
        </G>
      ))}
      {l.arrows.map((a, k) => (a.tagAt ? <Tag key={`t${k}`} at={a.tagAt} text={a.tag} /> : null))}
      {l.legend.map((row) => (
        <G key={`l${row.tag}`}>
          <Tag at={{ x: row.x + TAG_R, y: row.y + TAG_R }} text={row.tag} />
          <SvgText
            x={row.x + 2 * TAG_R + 4}
            y={row.y + TAG_R + LEGEND_FONT * 0.35}
            fontSize={LEGEND_FONT}
            fontFamily={FAMILY}
            fill={palette.ink2}
          >
            {row.text}
          </SvgText>
        </G>
      ))}
    </Frame>
  );
}

/** The number on an arrow: white on violet, so it reads as a label and never as a box. */
function Tag({ at, text }: { at: Point; text: string }) {
  const { palette } = useTheme();
  return (
    <G>
      <Circle cx={at.x} cy={at.y} r={TAG_R} fill={palette.primary} />
      <SvgText
        x={at.x}
        y={at.y + 3.5}
        fontSize={10}
        fontWeight="700"
        fontFamily={FAMILY}
        fill={palette.paper}
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </G>
  );
}

// ─────────────── Baumdiagramm ───────────────

/** "0.25" → "0,25" where her language writes a comma; a fraction stays as it is. */
function probText(p: string): string {
  return p.includes('.') ? localDecimal(p, currentLocale()) : p;
}

export function ProbTreePicture({ fig, width }: { fig: ProbTreeFigure; width: number }) {
  const { palette, figure: ink } = useTheme();
  const shown = useMemo(
    () => ({ ...fig, nodes: fig.nodes.map((n) => ({ ...n, p: probText(n.p) })) }),
    [fig],
  );
  const l = useMemo(() => probTreeLayout(shown), [shown]);
  return (
    <Frame width={width} height={l.height}>
      {l.branches.map((b, k) => (
        <Line
          key={`br${k}`}
          x1={b.from.x}
          y1={b.from.y}
          x2={b.to.x}
          y2={b.to.y}
          stroke={ink.axis}
          strokeWidth={1.4}
        />
      ))}
      <Circle cx={l.root.x} cy={l.root.y} r={3.5} fill={palette.ink} />
      {l.nodes.map((n, k) => {
        const gap = n.label.text === '?';
        return (
          <G key={`n${k}`}>
            <SvgText
              x={n.text.x + 4}
              y={n.at.y + FONT * 0.35}
              fontSize={FONT}
              fontWeight="600"
              fontFamily={FAMILY}
              fill={palette.ink}
            >
              {n.text.text}
            </SvgText>
            {/* The probability sits on its branch, cut out of the line so it stays legible. */}
            <Rect
              x={n.label.x}
              y={n.label.y}
              width={n.label.w}
              height={n.label.h}
              rx={4}
              fill={gap ? palette.primaryLt : palette.paper}
              stroke={gap ? palette.primary : 'none'}
              strokeWidth={gap ? 1.2 : 0}
            />
            <SvgText
              x={n.label.x + n.label.w / 2}
              y={n.label.y + n.label.h / 2 + 4}
              fontSize={11.5}
              fontWeight={gap ? '700' : '500'}
              fontFamily={FAMILY}
              fill={gap ? palette.primaryDk : palette.ink2}
              textAnchor="middle"
            >
              {n.label.text}
            </SvgText>
          </G>
        );
      })}
    </Frame>
  );
}

// ─────────────── Stammbaum ───────────────

export function PedigreePicture({ fig, width }: { fig: PedigreeFigure; width: number }) {
  const { palette, figure: ink } = useTheme();
  const l = useMemo(() => pedigreeLayout(fig), [fig]);
  const s = SYMBOL;
  return (
    <Frame width={width} height={l.height}>
      {l.couples.map((c, k) => (
        <Line
          key={`c${k}`}
          x1={c.from.x}
          y1={c.from.y}
          x2={c.to.x}
          y2={c.to.y}
          stroke={ink.stroke}
          strokeWidth={1.4}
        />
      ))}
      {l.families.map((f, k) => (
        <G key={`f${k}`}>
          {[f.drop, f.bar, ...f.stubs].map(([a, b], i) => (
            <Line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={ink.stroke}
              strokeWidth={1.4}
            />
          ))}
        </G>
      ))}
      {fig.people.map((p, k) => {
        const at = l.people[k] as Point;
        // Filled = shows the trait — the convention of every pedigree; the screen reader gets the
        // same in words (describeFigure), so the fill is never the only signal.
        const fill = p.ill ? palette.ink : palette.paper;
        return (
          <G key={`p${k}`}>
            {p.sex === 'm' ? (
              <Rect
                x={at.x - s / 2}
                y={at.y - s / 2}
                width={s}
                height={s}
                fill={fill}
                stroke={palette.ink}
                strokeWidth={1.6}
              />
            ) : (
              <Circle
                cx={at.x}
                cy={at.y}
                r={s / 2}
                fill={fill}
                stroke={palette.ink}
                strokeWidth={1.6}
              />
            )}
            <SvgText
              x={at.x}
              y={at.y + s / 2 + 13}
              fontSize={11}
              fontWeight="600"
              fontFamily={FAMILY}
              fill={palette.ink2}
              textAnchor="middle"
            >
              {String(k + 1)}
            </SvgText>
          </G>
        );
      })}
    </Frame>
  );
}

// ─────────────── Automat ───────────────

export function AutomatonPicture({ fig, width }: { fig: AutomatonFigure; width: number }) {
  const { palette, figure: ink } = useTheme();
  const l = useMemo(() => automatonLayout(fig), [fig]);
  const r = STATE_R;
  return (
    <Frame width={width} height={l.height}>
      <Line
        x1={l.start.from.x}
        y1={l.start.from.y}
        x2={l.start.to.x - 5}
        y2={l.start.to.y}
        stroke={ink.axis}
        strokeWidth={1.6}
      />
      <Polygon points={headAt(l.start.from, l.start.to)} fill={ink.axis} />
      {l.moves.map((m, k) => (
        <G key={`m${k}`}>
          <Path
            d={`M ${m.from.x} ${m.from.y} Q ${m.via.x} ${m.via.y} ${m.to.x} ${m.to.y}`}
            stroke={ink.axis}
            strokeWidth={1.5}
            fill="none"
          />
          <Polygon points={headAt(m.via, m.to)} fill={ink.axis} />
          <SvgText
            x={m.label.x + m.label.w / 2}
            y={m.label.y + m.label.h - 3}
            fontSize={FONT}
            fontWeight="600"
            fontFamily={FAMILY}
            fill={palette.primaryDk}
            textAnchor="middle"
          >
            {m.label.text}
          </SvgText>
        </G>
      ))}
      {l.states.map((p, k) => (
        <G key={`s${k}`}>
          <Circle
            cx={p.x}
            cy={p.y}
            r={r}
            fill={palette.primaryLt}
            stroke={palette.ink}
            strokeWidth={1.5}
          />
          {fig.states[k]?.accept ? (
            <Circle
              cx={p.x}
              cy={p.y}
              r={r - 4}
              fill="none"
              stroke={palette.ink}
              strokeWidth={1.3}
            />
          ) : null}
          <SvgText
            x={p.x}
            y={p.y + 4}
            fontSize={FONT}
            fontWeight="600"
            fontFamily={FAMILY}
            fill={palette.ink}
            textAnchor="middle"
          >
            {`q${k}`}
          </SvgText>
        </G>
      ))}
    </Frame>
  );
}
