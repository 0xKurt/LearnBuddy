// Circuit diagrams and logic nets (issue #261), drawn as German schoolbooks draw them (DIN EN
// 60617): a lamp is a circle with a cross, a resistor a box, a switch a lever between two
// contacts, a meter a circle with A or V, the battery a long and a short plate; a gate is a box
// with &, ≥1, =1 or 1 and a small circle for a negated output, the inputs are rails with taps.
// Nothing here decides anything: where every part, wire and dot stands comes from
// packages/shared-math/src/circuit.ts and logic.ts — the same code that checked the figure on
// the server and computed its key. Nothing shows the answer either: a lamp is drawn the same
// whether it lights or not. Each figure also says in words what it shows.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

// Imported by path, like trees.js in TreeFigures: dependency-free, the server's own layout.
import { TICK_FONT } from '../../../../packages/shared-math/src/charts.js';
import {
  AXIS,
  circuitLayout,
  circuitParts,
  PLATE,
  SYMBOL,
  type DrawnPart,
} from '../../../../packages/shared-math/src/circuit.js';
import {
  BUBBLE,
  GATE_H,
  GATE_SYMBOL,
  GATE_W,
  gateInputs,
  logicInputCount,
  logicLayout,
  RAIL_TOP,
} from '../../../../packages/shared-math/src/logic.js';
import type { XY } from '../../../../packages/shared-math/src/trees.js';
import type { Translate } from '../../lib/i18n/index.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT, formatNumber } from './figureText.js';
import { FittedSvg } from './TreeFigures.js';

export type CircuitFig = Extract<Figure, { type: 'circuit' }>;
export type LogicFig = Extract<Figure, { type: 'logic' }>;
type Ink = ReturnType<typeof useTheme>['figure'];

const STROKE = 1.6;
const DOT = 2.6;
/** A lamp's and a meter's circle, and the half-length of a switch between its contacts. */
const RING = 10;
const CONTACT = 10;
/**
 * A schematic is drawn up to this much larger when the card is wider than it needs. Where the
 * room is short FigureView shrinks it as a whole (`scale`, issue #419): at 1.5 it once stood so
 * tall at 360 × 740 that the hint row was cut, because a drawing laid out at the shrunk width did
 * not fit and vanished — #261 held it at 1.3 until then.
 */
const MAX_ZOOM = 1.5;

/**
 * The largest zoom (1 to MAX_ZOOM, in tenths) at which `lay` still fits `width`, and the layout
 * at the width it is drawn at. The layout is the server's, magnified as a whole — lines, symbols
 * and text alike — so a small circuit fills its card instead of standing in its middle.
 */
function zoomed<L>(
  lay: (w: number) => L | null,
  width: number,
): { zoom: number; layout: L } | null {
  for (let tenths = MAX_ZOOM * 10; tenths >= 10; tenths -= 1) {
    const layout = lay(width / (tenths / 10));
    if (layout) return { zoom: tenths / 10, layout };
  }
  return null;
}

function Wires({ wires, dots, ink }: { wires: { from: XY; to: XY }[]; dots: XY[]; ink: Ink }) {
  return (
    <G>
      {wires.map((w, k) => (
        <Line
          key={`w${k}`}
          x1={w.from.x}
          y1={w.from.y}
          x2={w.to.x}
          y2={w.to.y}
          stroke={ink.stroke}
          strokeWidth={STROKE}
          strokeLinecap="square"
        />
      ))}
      {dots.map((d, k) => (
        <Circle key={`d${k}`} cx={d.x} cy={d.y} r={DOT} fill={ink.stroke} />
      ))}
    </G>
  );
}

function Label({
  x,
  y,
  text,
  ink,
  bold = false,
}: {
  x: number;
  y: number;
  text: string;
  ink: Ink;
  bold?: boolean;
}) {
  return (
    <SvgText
      fontFamily={FAMILY}
      x={x}
      y={y}
      fontSize={TICK_FONT}
      fontWeight={bold ? '600' : '400'}
      fill={bold ? ink.stroke : ink.label}
      textAnchor="middle"
    >
      {text}
    </SvgText>
  );
}

/** One part's symbol, centred on `at`, with its name above and its value below. */
function PartSymbol({ part, ink }: { part: DrawnPart; ink: Ink }) {
  const { x, y } = part.at;
  const line = { stroke: ink.stroke, strokeWidth: STROKE };
  let symbol;
  switch (part.kind) {
    case 'lamp': {
      const d = RING * 0.7;
      symbol = (
        <G>
          <Circle cx={x} cy={y} r={RING} fill={ink.paper} {...line} />
          <Line x1={x - d} y1={y - d} x2={x + d} y2={y + d} {...line} />
          <Line x1={x - d} y1={y + d} x2={x + d} y2={y - d} {...line} />
        </G>
      );
      break;
    }
    case 'resistor':
      symbol = (
        <Rect x={x - SYMBOL / 2} y={y - 5} width={SYMBOL} height={10} fill={ink.paper} {...line} />
      );
      break;
    case 'switch':
      symbol = (
        <G>
          <Line x1={x - SYMBOL / 2} y1={y} x2={x - CONTACT} y2={y} {...line} />
          <Line x1={x + CONTACT} y1={y} x2={x + SYMBOL / 2} y2={y} {...line} />
          <Line
            x1={x - CONTACT}
            y1={y}
            x2={x + CONTACT - (part.open ? 2 : 0)}
            y2={part.open ? y - 9 : y}
            {...line}
          />
          <Circle cx={x - CONTACT} cy={y} r={DOT} fill={ink.stroke} />
          <Circle cx={x + CONTACT} cy={y} r={DOT} fill={ink.paper} {...line} />
        </G>
      );
      break;
    case 'ammeter':
    case 'voltmeter':
      symbol = (
        <G>
          <Circle cx={x} cy={y} r={RING} fill={ink.paper} {...line} />
          <SvgText
            fontFamily={FAMILY}
            x={x}
            y={y + 4.5}
            fontSize={FONT}
            fontWeight="700"
            fill={ink.stroke}
            textAnchor="middle"
          >
            {part.kind === 'ammeter' ? 'A' : 'V'}
          </SvgText>
        </G>
      );
  }
  const value = part.ohm > 0 ? `${formatNumber(part.ohm)} Ω` : '';
  return (
    <G>
      {symbol}
      {part.name ? <Label x={x} y={y - AXIS + 9} text={part.name} ink={ink} bold /> : null}
      {value ? <Label x={x} y={y + AXIS} text={value} ink={ink} /> : null}
    </G>
  );
}

/** The width FigureView gives the drawing, already shrunk by its `scale` (#419). */
type BodyProps<F> = { figure: F; width: number; scale: number };

function CircuitBody({ figure, width, scale }: BodyProps<CircuitFig>) {
  const { figure: ink } = useTheme();
  // The server never stores a circuit it could not lay out at the narrowest phone.
  const fit = zoomed((w) => circuitLayout(figure, w), width / scale);
  if (!fit) return null;
  const { zoom, layout } = fit;
  const { x, y } = layout.battery;
  return (
    <FittedSvg width={layout.width} height={layout.height} scale={zoom * scale}>
      <Wires wires={layout.wires} dots={layout.dots} ink={ink} />
      {layout.parts.map((part, k) => (
        <PartSymbol key={k} part={part} ink={ink} />
      ))}
      {/* The battery: the long plate is the plus pole. */}
      <Line
        x1={x - 3}
        y1={y - PLATE}
        x2={x - 3}
        y2={y + PLATE}
        stroke={ink.stroke}
        strokeWidth={2}
      />
      <Line x1={x + 3} y1={y - 6} x2={x + 3} y2={y + 6} stroke={ink.stroke} strokeWidth={4} />
      {figure.u > 0 ? (
        <Label x={x} y={y - PLATE - 4} text={`${formatNumber(figure.u)} V`} ink={ink} bold />
      ) : null}
    </FittedSvg>
  );
}

function LogicBody({ figure, width, scale }: BodyProps<LogicFig>) {
  const { figure: ink } = useTheme();
  const fit = zoomed((w) => logicLayout(figure, w), width / scale);
  if (!fit) return null;
  const { zoom, layout } = fit;
  const line = { stroke: ink.stroke, strokeWidth: STROKE };
  return (
    <FittedSvg width={layout.width} height={layout.height} scale={zoom * scale}>
      {layout.rails.map((r) => (
        <G key={r.name}>
          <SvgText
            fontFamily={FAMILY}
            x={r.x}
            y={RAIL_TOP - 4}
            fontSize={FONT}
            fontWeight="700"
            fill={ink.stroke}
            textAnchor="middle"
          >
            {r.name}
          </SvgText>
          <Line x1={r.x} y1={r.y0} x2={r.x} y2={r.y1} {...line} />
        </G>
      ))}
      <Wires wires={layout.wires} dots={layout.dots} ink={ink} />
      {layout.gates.map((g) => {
        const sym = GATE_SYMBOL[g.op];
        return (
          <G key={g.name}>
            <Rect
              x={g.at.x}
              y={g.at.y - GATE_H / 2}
              width={GATE_W}
              height={GATE_H}
              rx={2}
              fill={ink.paper}
              {...line}
            />
            <SvgText
              fontFamily={FAMILY}
              x={g.at.x + GATE_W / 2}
              y={g.at.y + 4.5}
              fontSize={FONT}
              fontWeight="700"
              fill={ink.stroke}
              textAnchor="middle"
            >
              {sym.text}
            </SvgText>
            {sym.negated ? (
              <Circle
                cx={g.at.x + GATE_W + BUBBLE}
                cy={g.at.y}
                r={BUBBLE}
                fill={ink.paper}
                {...line}
              />
            ) : null}
            <Label x={g.at.x + GATE_W / 2} y={g.at.y - GATE_H / 2 - 3} text={g.name} ink={ink} />
          </G>
        );
      })}
      <SvgText
        fontFamily={FAMILY}
        x={layout.out.x + 4}
        y={layout.out.y + 4.5}
        fontSize={FONT}
        fontWeight="700"
        fill={ink.stroke}
      >
        Q
      </SvgText>
    </FittedSvg>
  );
}

export function SwitchingBody({
  figure,
  width,
  scale = 1,
}: Omit<BodyProps<CircuitFig | LogicFig>, 'scale'> & { scale?: number }) {
  return figure.type === 'circuit' ? (
    <CircuitBody figure={figure} width={width} scale={scale} />
  ) : (
    <LogicBody figure={figure} width={width} scale={scale} />
  );
}

/** A part in words: its kind, its name, its value, a switch's state. */
function partWords(p: ReturnType<typeof circuitParts>[number], t: Translate): string {
  if (p.k === 'switch')
    return t(p.o ? 'figure.circuit_switch_open' : 'figure.circuit_switch_closed', { name: p.name });
  const words = t(`figure.circuit_${p.k}`, { name: p.name });
  return p.r > 0 ? `${words} ${formatNumber(p.r)} Ω` : words;
}

/**
 * The same content as the drawing, in words: the battery, each block along the wire with its
 * branches, every part and the meter. Never whether a lamp lights or what a meter reads.
 */
function describeCircuit(figure: CircuitFig, t: Translate): string {
  const parts = circuitParts(figure);
  const head =
    figure.u > 0
      ? t('figure.circuit', { u: `${formatNumber(figure.u)} V` })
      : t('figure.circuit_plain');
  const blocks = figure.b.map((block, bi) =>
    block
      .map((_, ri) =>
        parts
          .filter((p) => p.block === bi && p.branch === ri)
          .map((p) => partWords(p, t))
          .join(', '),
      )
      .join(`, ${t('figure.circuit_parallel')} `),
  );
  const meter =
    figure.m === 'none'
      ? []
      : [
          figure.mt === ''
            ? t(`figure.circuit_${figure.m}_main`)
            : t(`figure.circuit_${figure.m}`, { name: figure.mt }),
        ];
  return [head, ...blocks, ...meter].join('. ');
}

/** The net in words: its inputs, every gate with what it takes, and which gate is Q. */
function describeLogic(figure: LogicFig, t: Translate): string {
  const inputs = ['A', 'B', 'C'].slice(0, logicInputCount(figure)).join(', ');
  const gates = figure.g.map((g, k) => {
    const [a, b] = gateInputs(g);
    const values = { name: `G${k + 1}`, op: t(`figure.logic_${g.o}`), a: a ?? '', b: b ?? '' };
    return t(b === undefined ? 'figure.logic_gate_one' : 'figure.logic_gate', values);
  });
  const out = t('figure.logic_out', { name: `G${figure.g.length}` });
  return [t('figure.logic', { inputs }), ...gates, out].join('. ');
}

export function describeSwitching(figure: CircuitFig | LogicFig, t: Translate): string {
  return figure.type === 'circuit' ? describeCircuit(figure, t) : describeLogic(figure, t);
}
