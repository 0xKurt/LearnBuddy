// The figure library, drawn (issues #250, #252, #261): the periodic table, a schematic drawing
// with its pins, Itten's colour wheel, a circuit and logic gates. One drawing each, used twice:
// as the figure she taps in (FigureTapAnswer, with what she chose marked) and as the figure that
// stands with a question (FigureView, with the part asked for marked). Where things stand is
// computed in lib/figure/ (tested); colours come from the palette only.
//
// Never colour as the only signal: the table's cells carry their symbols, the wheel's fields
// their names, a circuit's parts their names (L1, R1, S1) and values, a chosen thing a ring AND
// the words under the figure.

import {
  logicInputs,
  roman,
  type Circuit,
  type LogicNet,
  type PeriodicTableKind,
  type SchematicId,
} from '@learnbuddy/shared-types/contracts';
import { Platform } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText, TSpan } from 'react-native-svg';

import {
  circuitLayout,
  gateSymbol,
  logicHeight,
  PT_HEAD,
  PT_SIDE,
  wheelLines,
  type CircuitLayout,
  type PtFrame,
} from '../../../lib/figure/library.js';
import type { PinLayout } from '../../../lib/figure/pins.js';
import { useTheme } from '../../../lib/theme/ThemeProvider.js';
import { formatNumber } from '../../math/FigureView.js';
import { ART, type Ink } from './schematics/art.js';

const FAMILY = Platform.select({
  web: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  default: undefined,
});

// ─────────────── periodic table ───────────────

export function PeriodicSvg({
  frame: f,
  table,
  mark,
}: {
  frame: PtFrame;
  table: PeriodicTableKind;
  /** The element to mark: what she chose, or the one a question is about. */
  mark: string | null;
}) {
  const { palette, figure: ink } = useTheme();
  const small = f.cellW < 30;
  const symSize = Math.max(9, Math.min(17, f.cellW * 0.42));
  return (
    <Svg width={f.width} height={f.height}>
      {f.groups.slice(f.c0, f.c1).map((g, i) => (
        <SvgText
          key={`g${g}`}
          fontFamily={FAMILY}
          x={PT_SIDE + (i + 0.5) * f.cellW}
          y={PT_HEAD - 5}
          fontSize={small ? 8 : 11}
          fontWeight="600"
          fill={palette.ink2}
          textAnchor="middle"
        >
          {table === 'main' ? roman(i + f.c0 + 1) : String(g)}
        </SvgText>
      ))}
      {Array.from({ length: f.periods }, (_, p) => (
        <SvgText
          key={`p${p}`}
          fontFamily={FAMILY}
          x={PT_SIDE / 2 - 1}
          y={PT_HEAD + (p + 0.5) * f.cellH + 4}
          fontSize={small ? 8 : 11}
          fontWeight="600"
          fill={palette.ink2}
          textAnchor="middle"
        >
          {String(p + 1)}
        </SvgText>
      ))}
      {f.cells.map((c) => {
        const on = c.id === mark;
        return (
          <G key={c.id}>
            <Rect
              x={c.x + 1}
              y={c.y + 1}
              width={c.w - 2}
              height={c.h - 2}
              rx={small ? 2 : 5}
              fill={on ? ink.point : palette.canvas}
              stroke={on ? ink.point : palette.hairline}
              strokeWidth={1}
            />
            {small ? null : (
              <SvgText
                fontFamily={FAMILY}
                x={c.x + 4}
                y={c.y + 11}
                fontSize={8.5}
                fill={on ? palette.paper : palette.ink2}
              >
                {String(c.e.z)}
              </SvgText>
            )}
            <SvgText
              fontFamily={FAMILY}
              x={c.x + c.w / 2}
              y={c.y + c.h / 2 + symSize * (small ? 0.35 : 0.5)}
              fontSize={symSize}
              fontWeight="700"
              fill={on ? palette.paper : palette.ink}
              textAnchor="middle"
            >
              {c.e.sym}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── schematic drawings ───────────────

export function useArtInk(): Ink {
  const { palette } = useTheme();
  return {
    ...palette.art,
    danger: palette.danger,
    warning: palette.warning,
    paper: palette.paper,
  };
}

export function SchematicSvg({
  drawing,
  layout,
  numbered,
  focus,
  chosen,
}: {
  drawing: SchematicId;
  layout: PinLayout;
  /** Pins carry their numbers (a naming question) or are empty places to tap. */
  numbered: boolean;
  /** The pin a question asks about: drawn in the accent. */
  focus: string | null;
  /** The pin she tapped. */
  chosen: string | null;
}) {
  const { palette, figure: fig } = useTheme();
  const ink = useArtInk();
  const { art } = layout;
  return (
    <Svg width={layout.width} height={layout.height}>
      <G transform={`translate(${art.x} ${art.y}) scale(${art.scale})`}>{ART[drawing](ink)}</G>
      {layout.pins.map((p) => {
        const on = p.id === chosen || p.id === focus;
        // The line ends at the pin's edge, the dot sits on the part.
        const dx = p.ax - p.x;
        const dy = p.ay - p.y;
        const len = Math.hypot(dx, dy) || 1;
        return (
          <G key={p.id}>
            <Line
              x1={p.x + (dx / len) * layout.r}
              y1={p.y + (dy / len) * layout.r}
              x2={p.ax}
              y2={p.ay}
              stroke={on ? fig.point : palette.ink2}
              strokeWidth={on ? 1.8 : 1.1}
            />
            <Circle cx={p.ax} cy={p.ay} r={2.6} fill={on ? fig.point : palette.ink} />
            <Circle
              cx={p.x}
              cy={p.y}
              r={layout.r}
              fill={on ? fig.point : palette.paper}
              stroke={on ? fig.point : palette.ink2}
              strokeWidth={on ? 2 : 1.4}
            />
            {numbered ? (
              <SvgText
                fontFamily={FAMILY}
                x={p.x}
                y={p.y + layout.r * 0.34}
                fontSize={layout.r < 13 ? 12 : 14}
                fontWeight="700"
                fill={on ? palette.paper : palette.ink}
                textAnchor="middle"
              >
                {String(p.n)}
              </SvgText>
            ) : p.id === chosen ? (
              <Path
                d={`M${p.x - 5.5} ${p.y} L${p.x - 1.5} ${p.y + 4} L${p.x + 6} ${p.y - 4.5}`}
                stroke={palette.paper}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : null}
          </G>
        );
      })}
    </Svg>
  );
}

// ─────────────── the colour wheel ───────────────

/** The empty middle of the wheel, as a share of its radius. */
export const WHEEL_HOLE = 0.3;

export function WheelSvg({
  size,
  names,
  chosen,
}: {
  size: number;
  /** The twelve names, clockwise from yellow, with "|" where a name breaks. */
  names: readonly string[];
  chosen: number | null;
}) {
  const { palette } = useTheme();
  const c = size / 2;
  const R = c - 3;
  const r0 = R * WHEEL_HOLE;
  const at = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: c + Math.sin(a) * r, y: c - Math.cos(a) * r };
  };
  const wedge = (i: number, outer: number) => {
    const a = at(i * 30 - 15, outer);
    const b = at(i * 30 + 15, outer);
    const d = at(i * 30 + 15, r0);
    const e = at(i * 30 - 15, r0);
    return `M${e.x} ${e.y} L${a.x} ${a.y} A${outer} ${outer} 0 0 1 ${b.x} ${b.y} L${d.x} ${d.y} A${r0} ${r0} 0 0 0 ${e.x} ${e.y} Z`;
  };
  const luminance = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const font = Math.max(9.5, Math.min(12, size / 28));
  return (
    <Svg width={size} height={size}>
      {palette.wheel.map((color, i) => (
        <Path key={i} d={wedge(i, R)} fill={color} stroke={palette.paper} strokeWidth={2} />
      ))}
      {chosen !== null ? (
        <Path
          d={wedge(chosen, R)}
          fill="none"
          stroke={palette.ink}
          strokeWidth={3.5}
          strokeLinejoin="round"
        />
      ) : null}
      {names.map((name, i) => {
        const lines = wheelLines(name);
        const p = at(i * 30, (R + r0) / 2 + 2);
        const fill =
          luminance(palette.wheel[i] ?? '#000000') > 0.33
            ? palette.wheelInk[0]
            : palette.wheelInk[1];
        return (
          <SvgText
            key={i}
            fontFamily={FAMILY}
            x={p.x}
            y={p.y - ((lines.length - 1) * font * 1.1) / 2 + font * 0.35}
            fontSize={font}
            fontWeight={i === chosen ? '800' : '600'}
            fill={fill}
            textAnchor="middle"
          >
            {lines.map((line, k) => (
              <TSpan key={k} x={p.x} dy={k === 0 ? 0 : font * 1.1}>
                {line}
              </TSpan>
            ))}
          </SvgText>
        );
      })}
      <Circle cx={c} cy={c} r={r0 - 3} fill={palette.paper} />
    </Svg>
  );
}

// ─────────────── the circuit ───────────────

export function CircuitSvg({
  circuit,
  width,
  chosen,
  layout: given,
}: {
  circuit: Circuit;
  width: number;
  /** The lamp she tapped. */
  chosen: string | null;
  layout?: CircuitLayout;
}) {
  const { palette, figure: fig } = useTheme();
  const l = given ?? circuitLayout(circuit, width);
  const wire = palette.ink;
  const meterAt = circuit.meter ? l.parts.find((p) => p.part.id === circuit.meter!.at) : null;
  const label = (x: number, y: number, text: string, bold = false) => (
    <SvgText
      fontFamily={FAMILY}
      x={x}
      y={y}
      fontSize={12}
      fontWeight={bold ? '700' : '500'}
      fill={bold ? palette.ink : palette.ink2}
      textAnchor="middle"
    >
      {text}
    </SvgText>
  );
  // A part's half-width on its wire; the wire is drawn up to it.
  const half = 13;
  return (
    <Svg width={l.width} height={l.height}>
      {/* the loop: top wire, return wire, the battery's side, the far side */}
      <Line
        x1={l.left}
        y1={l.top}
        x2={l.blocks[0]!.x0}
        y2={l.top}
        stroke={wire}
        strokeWidth={1.6}
      />
      <Line x1={l.left} y1={l.bottom} x2={l.right} y2={l.bottom} stroke={wire} strokeWidth={1.6} />
      <Line x1={l.right} y1={l.top} x2={l.right} y2={l.bottom} stroke={wire} strokeWidth={1.6} />
      <Line
        x1={l.left}
        y1={l.top}
        x2={l.left}
        y2={(l.top + l.bottom) / 2 - 6}
        stroke={wire}
        strokeWidth={1.6}
      />
      <Line
        x1={l.left}
        y1={(l.top + l.bottom) / 2 + 6}
        x2={l.left}
        y2={l.bottom}
        stroke={wire}
        strokeWidth={1.6}
      />
      {/* battery: the long thin plate is +, the short thick one − */}
      <Line
        x1={l.left - 13}
        y1={(l.top + l.bottom) / 2 - 6}
        x2={l.left + 13}
        y2={(l.top + l.bottom) / 2 - 6}
        stroke={wire}
        strokeWidth={1.8}
      />
      <Line
        x1={l.left - 7}
        y1={(l.top + l.bottom) / 2 + 6}
        x2={l.left + 7}
        y2={(l.top + l.bottom) / 2 + 6}
        stroke={wire}
        strokeWidth={4}
      />
      {label(l.left + 20, (l.top + l.bottom) / 2 - 10, '+')}
      {circuit.voltage !== null ? (
        <SvgText
          fontFamily={FAMILY}
          x={l.left - 18}
          y={(l.top + l.bottom) / 2 + 4}
          fontSize={12}
          fontWeight="700"
          fill={palette.ink}
          textAnchor="end"
        >
          {`${formatNumber(circuit.voltage)} V`}
        </SvgText>
      ) : null}
      {/* blocks: the branches' wires and the bars that join them */}
      {l.blocks.map((b, bi) => {
        const block = circuit.blocks[bi]!;
        const last = b.ys[b.ys.length - 1]!;
        return (
          <G key={bi}>
            {b.ys.length > 1 ? (
              <>
                <Line x1={b.x0} y1={l.top} x2={b.x0} y2={last} stroke={wire} strokeWidth={1.6} />
                <Line x1={b.x1} y1={l.top} x2={b.x1} y2={last} stroke={wire} strokeWidth={1.6} />
                <Circle cx={b.x0} cy={l.top} r={2.6} fill={wire} />
                <Circle cx={b.x1} cy={l.top} r={2.6} fill={wire} />
              </>
            ) : null}
            {block.branches.map((br, k) => {
              const y = b.ys[k]!;
              const placed = l.parts.filter((p) => br.includes(p.part));
              // Wire pieces between the parts of this branch.
              const stops = [b.x0, ...placed.flatMap((p) => [p.x - half, p.x + half]), b.x1];
              return (
                <G key={k}>
                  {Array.from({ length: stops.length / 2 }, (_, i) => (
                    <Line
                      key={i}
                      x1={stops[2 * i]!}
                      y1={y}
                      x2={stops[2 * i + 1]!}
                      y2={y}
                      stroke={wire}
                      strokeWidth={1.6}
                    />
                  ))}
                </G>
              );
            })}
          </G>
        );
      })}
      {l.parts.map(({ part: p, x, y }) => {
        const on = p.id === chosen;
        const name = p.id.toUpperCase();
        const value = p.ohm !== null ? `${formatNumber(p.ohm)} Ω` : null;
        return (
          <G key={p.id}>
            {on ? (
              <Circle cx={x} cy={y} r={20} fill={fig.fillSoft} stroke={fig.point} strokeWidth={2} />
            ) : null}
            {p.part === 'lamp' ? (
              <G>
                <Circle cx={x} cy={y} r={11} fill={palette.paper} stroke={wire} strokeWidth={1.6} />
                <Line
                  x1={x - 7.8}
                  y1={y - 7.8}
                  x2={x + 7.8}
                  y2={y + 7.8}
                  stroke={wire}
                  strokeWidth={1.4}
                />
                <Line
                  x1={x - 7.8}
                  y1={y + 7.8}
                  x2={x + 7.8}
                  y2={y - 7.8}
                  stroke={wire}
                  strokeWidth={1.4}
                />
              </G>
            ) : p.part === 'resistor' ? (
              <Rect
                x={x - half}
                y={y - 5.5}
                width={2 * half}
                height={11}
                fill={palette.paper}
                stroke={wire}
                strokeWidth={1.6}
              />
            ) : (
              <G>
                <Line
                  x1={x - half}
                  y1={y}
                  x2={x - half + 2}
                  y2={y}
                  stroke={wire}
                  strokeWidth={1.6}
                />
                <Circle cx={x - half + 3} cy={y} r={2.4} fill={wire} />
                <Line
                  x1={x - half + 3}
                  y1={y}
                  x2={x + half - 1}
                  y2={p.open ? y - 11 : y - 1.5}
                  stroke={wire}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
                <Circle cx={x + half - 2} cy={y} r={2.4} fill={wire} />
              </G>
            )}
            {label(x, y + 26, name, true)}
            {value ? label(x, y - 16, value) : null}
          </G>
        );
      })}
      {meterAt && circuit.meter ? (
        <Meter
          kind={circuit.meter.kind}
          x={meterAt.x}
          y={meterAt.y}
          wire={wire}
          paper={palette.paper}
          ink={palette.ink}
        />
      ) : null}
    </Svg>
  );
}

/** An ammeter on the wire just before its part; a voltmeter on a bracket over it. */
function Meter({
  kind,
  x,
  y,
  wire,
  paper,
  ink,
}: {
  kind: 'ammeter' | 'voltmeter';
  x: number;
  y: number;
  wire: string;
  paper: string;
  ink: string;
}) {
  if (kind === 'voltmeter') {
    const top = y - 30;
    return (
      <G>
        <Path
          d={`M${x - 20} ${y} L${x - 20} ${top} L${x + 20} ${top} L${x + 20} ${y}`}
          stroke={wire}
          strokeWidth={1.3}
          fill="none"
        />
        <Circle cx={x - 20} cy={y} r={2.4} fill={wire} />
        <Circle cx={x + 20} cy={y} r={2.4} fill={wire} />
        <Circle cx={x} cy={top} r={10} fill={paper} stroke={wire} strokeWidth={1.6} />
        <SvgText
          fontFamily={FAMILY}
          x={x}
          y={top + 4.5}
          fontSize={12}
          fontWeight="700"
          fill={ink}
          textAnchor="middle"
        >
          V
        </SvgText>
      </G>
    );
  }
  const mx = x - 27;
  return (
    <G>
      <Circle cx={mx} cy={y} r={9.5} fill={paper} stroke={wire} strokeWidth={1.6} />
      <SvgText
        fontFamily={FAMILY}
        x={mx}
        y={y + 4.5}
        fontSize={12}
        fontWeight="700"
        fill={ink}
        textAnchor="middle"
      >
        A
      </SvgText>
    </G>
  );
}

// ─────────────── logic gates ───────────────

export function LogicSvg({ net, width }: { net: LogicNet; width: number }) {
  const { palette } = useTheme();
  const inputs = logicInputs(net);
  const height = logicHeight(net);
  const ink = palette.ink;
  const two = net.then !== null;
  const box = { w: 46, h: two ? 40 : 48 };
  // First gate on A (and B); with a second gate it stands left, the second one right.
  const g1 = { x: two ? width * 0.24 : width * 0.45 - box.w / 2, y: 4 };
  const g2 = { x: width * 0.68 - box.w / 2, y: 22 };
  const firstIns = net.gate === 'not' ? 1 : 2;
  const inX = 22;
  const label = (
    x: number,
    y: number,
    text: string,
    anchor: 'start' | 'middle' | 'end' = 'middle',
  ) => (
    <SvgText
      fontFamily={FAMILY}
      x={x}
      y={y}
      fontSize={14}
      fontWeight="700"
      fill={ink}
      textAnchor={anchor}
    >
      {text}
    </SvgText>
  );
  const gate = (
    x: number,
    y: number,
    h: number,
    g: LogicNet['gate'] | NonNullable<LogicNet['then']>,
  ) => {
    const s = gateSymbol(g);
    return (
      <G>
        <Rect
          x={x}
          y={y}
          width={box.w}
          height={h}
          rx={3}
          fill={palette.paper}
          stroke={ink}
          strokeWidth={1.8}
        />
        <SvgText
          fontFamily={FAMILY}
          x={x + box.w / 2}
          y={y + 19}
          fontSize={15}
          fontWeight="700"
          fill={ink}
          textAnchor="middle"
        >
          {s.text}
        </SvgText>
        {s.negated ? (
          <Circle
            cx={x + box.w + 4}
            cy={y + h / 2}
            r={4}
            fill={palette.paper}
            stroke={ink}
            strokeWidth={1.6}
          />
        ) : null}
      </G>
    );
  };
  const h1 = box.h;
  const out1 = { x: g1.x + box.w + (gateSymbol(net.gate).negated ? 8 : 0), y: g1.y + h1 / 2 };
  const ys1 = firstIns === 1 ? [g1.y + h1 / 2] : [g1.y + h1 * 0.28, g1.y + h1 * 0.72];
  return (
    <Svg width={width} height={height}>
      {ys1.map((y, i) => (
        <G key={i}>
          {label(inX - 8, y + 5, inputs[i]!, 'end')}
          <Line x1={inX} y1={y} x2={g1.x} y2={y} stroke={ink} strokeWidth={1.6} />
        </G>
      ))}
      {gate(g1.x, g1.y, h1, net.gate)}
      {two && net.then ? (
        <G>
          {(() => {
            const h2 = box.h;
            const ya = g2.y + h2 * 0.28;
            const yb = g2.y + h2 * 0.72;
            const mid = (out1.x + g2.x) / 2;
            // The last input runs straight under the first gate into the second one.
            const cY = g2.y + h2 * 0.72;
            const out2 = g2.x + box.w + (gateSymbol(net.then).negated ? 8 : 0);
            return (
              <>
                <Path
                  d={`M${out1.x} ${out1.y} L${mid} ${out1.y} L${mid} ${ya} L${g2.x} ${ya}`}
                  stroke={ink}
                  strokeWidth={1.6}
                  fill="none"
                />
                {label((out1.x + mid) / 2 + 2, out1.y - 7, 'X')}
                {label(inX - 8, cY + 5, inputs[inputs.length - 1]!, 'end')}
                <Path
                  d={`M${inX} ${cY} L${g2.x} ${yb}`}
                  stroke={ink}
                  strokeWidth={1.6}
                  fill="none"
                />
                {gate(g2.x, g2.y, h2, net.then)}
                <Line
                  x1={out2}
                  y1={g2.y + h2 / 2}
                  x2={width - 26}
                  y2={g2.y + h2 / 2}
                  stroke={ink}
                  strokeWidth={1.6}
                />
                {label(width - 20, g2.y + h2 / 2 + 5, 'Q', 'start')}
              </>
            );
          })()}
        </G>
      ) : (
        <G>
          <Line
            x1={out1.x}
            y1={out1.y}
            x2={width - 26}
            y2={out1.y}
            stroke={ink}
            strokeWidth={1.6}
          />
          {label(width - 20, out1.y + 5, 'Q', 'start')}
        </G>
      )}
    </Svg>
  );
}
