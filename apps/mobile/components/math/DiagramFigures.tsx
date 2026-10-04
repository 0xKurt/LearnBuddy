// Diagrams (issue #247): boxes with arrows — a chain, a cycle (a ring, clockwise from the top
// left), a tree top down, or boxes on a small grid; a gap is a dashed box with its letter.
// Nothing here decides anything: where each box, arrow and label stands, and how a text wraps,
// comes from packages/shared-math/src/diagram.ts — the same code that checked the diagram on
// the server, so the app draws exactly what was checked. Each diagram also says in words what it
// shows (`describeDiagram`), so a gap question can be answered with a screen reader.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

// Imported by path, like trees.js in TreeFigures: dependency-free, the server's own layout.
import { TICK_FONT } from '../../../../packages/shared-math/src/charts.js';
import {
  BOX_FONT,
  BOX_LINE,
  BOX_PAD_Y,
  diagramLayout,
  gapLetters,
} from '../../../../packages/shared-math/src/diagram.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT, HaloText } from './figureText.js';
import { arrowHead } from './TreeFigures.js';

export type DiagramFig = Extract<Figure, { type: 'diagram' }>;
type T = (key: string, values?: Record<string, string | number>) => string;

/** Where a line's baseline sits below the top of its line box (12 px text in a 15 px line). */
const BASELINE = 11.5;

export function DiagramBody({ figure, width }: { figure: DiagramFig; width: number }) {
  const { figure: ink } = useTheme();
  const layout = diagramLayout(figure, width);
  // The server never stores a diagram it could not lay out at the narrowest phone.
  if (!layout) return null;
  const letters = gapLetters(figure);
  return (
    <Svg width={width} height={layout.height}>
      {layout.arrows.map((arrow, k) => {
        const text = figure.e[k]?.l ?? '';
        const len = Math.hypot(arrow.to.x - arrow.from.x, arrow.to.y - arrow.from.y) || 1;
        // The line stops where the head begins, so its end does not poke through the tip.
        const end = {
          x: arrow.to.x - ((arrow.to.x - arrow.from.x) / len) * 6,
          y: arrow.to.y - ((arrow.to.y - arrow.from.y) / len) * 6,
        };
        return (
          <G key={`a${k}`}>
            <Line
              x1={arrow.from.x}
              y1={arrow.from.y}
              x2={end.x}
              y2={end.y}
              stroke={ink.stroke}
              strokeWidth={1.6}
            />
            <Path d={arrowHead(arrow.from, arrow.to)} fill={ink.stroke} />
            {arrow.label ? (
              <HaloText
                x={arrow.label.x}
                y={arrow.label.y}
                anchor={arrow.label.anchor}
                text={text}
                size={TICK_FONT}
                color={ink.label}
                weight="400"
              />
            ) : null}
          </G>
        );
      })}
      {layout.boxes.map((box, i) => {
        const gap = letters[i] !== null;
        return (
          <G key={`b${i}`}>
            <Rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={8}
              fill={gap ? ink.fillSoft : ink.paper}
              stroke={gap ? ink.point : ink.axis}
              strokeWidth={gap ? 1.6 : 1.3}
              strokeDasharray={gap ? '5 4' : undefined}
            />
            {box.lines.map((line, j) => (
              <SvgText
                key={j}
                fontFamily={FAMILY}
                x={box.x + box.w / 2}
                y={
                  gap
                    ? box.y + box.h / 2 + FONT * 0.36
                    : box.y + BOX_PAD_Y + j * BOX_LINE + BASELINE
                }
                fontSize={gap ? FONT : BOX_FONT}
                fontWeight={gap ? '700' : '400'}
                fill={gap ? ink.point : ink.stroke}
                textAnchor="middle"
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

/**
 * The same content as the drawing, in words: its kind, every arrow with its label, a gap by its
 * letter. Nothing a question asks for — what belongs in a gap is never said.
 */
export function describeDiagram(figure: DiagramFig, t: T): string {
  const letters = gapLetters(figure);
  const name = (i: number) => {
    const letter = letters[i];
    return letter ? t('figure.diagram_gap', { letter }) : (figure.n[i] ?? '');
  };
  const parts = [
    t('figure.diagram', { kind: t(`figure.diagram_${figure.k}`), n: figure.n.length }),
  ];
  for (const arrow of figure.e) {
    const ends = { a: name(arrow.a), b: name(arrow.b) };
    parts.push(
      arrow.l === ''
        ? t('figure.arrow_to', ends)
        : t('figure.arrow_to_label', { ...ends, label: arrow.l }),
    );
  }
  return parts.join('. ');
}
