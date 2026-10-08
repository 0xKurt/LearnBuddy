// A labelled picture (issue #252): a drawing of the picture library — a plant cell, an eye, a
// bicycle — in the app's pastels, with numbers beside it, each joined to its part by a leader
// line, as a schoolbook prints them (`schematicLayout.ts`). Nothing here decides anything: every
// part, its name and its outline are packages/shared-math (`schematics.ts`), the library the
// server checked the question against. The drawings come with the first picture
// (`useSchematicShapes`); until then the picture keeps its room. `describeSchematic` says in words
// what it shows — the drawing and how many parts are numbered, never their names (naming them is
// the task).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { regionPath } from '../../../../packages/shared-math/src/regions.js';
import { schematic, schematicNumbered } from '../../../../packages/shared-math/src/schematics.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { BADGE_R, schematicLayout } from '../../lib/math/schematicLayout.js';
import { useSchematicShapes } from '../../lib/math/useSchematicShapes.js';
import { isDarkBackground } from '../../lib/theme/luminance.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT } from './figureText.js';

export type SchematicFigure = Extract<Figure, { type: 'schematic' }>;
type T = (key: string, values?: Record<string, string | number>) => string;

export function SchematicBody({ figure, width }: { figure: SchematicFigure; width: number }) {
  const { figure: ink } = useTheme();
  const drawing = useSchematicShapes()?.SCHEMATIC_SHAPES[figure.d];
  const { k, x0, y0, height, badges } = schematicLayout(figure, width, drawing);
  if (!drawing) return <View style={{ width, height }} />;
  const paths = drawing.parts.map((p) => regionPath(p.rings, k));
  const tone = (t: number) => (t < 0 ? ink.stroke : (ink.slices[t] ?? ink.fill));
  const night = isDarkBackground(ink.paper);
  const [white, black] = night ? [ink.stroke, ink.paper] : [ink.paper, ink.stroke];
  return (
    <Svg width={width} height={height}>
      <G transform={`translate(${x0} ${y0})`}>
        {drawing.lines.map((l, i) => (
          <Path
            key={`l${i}`}
            d={regionPath([l], k).replace(/Z$/, '')}
            stroke={ink.axis}
            strokeOpacity={0.5}
            strokeWidth={1}
            fill="none"
          />
        ))}
        {drawing.parts.map((p, i) => (
          // Each part's outline under its own fill: shapes of one part that cross (the tubes of a
          // frame) show no line inside it, and the parts above draw their own.
          <G key={p.id}>
            <Path
              d={paths[i]}
              fill="none"
              stroke={ink.stroke}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <Path d={paths[i]} fill={tone(p.tone)} fillOpacity={p.tone < 0 ? 0.85 : 1} />
          </G>
        ))}
        {/* What is drawn on the parts without being one: a sign's white symbol, a fish's eye —
            white and black in either room, as a sign is at night. */}
        {drawing.marks?.white ? <Path d={regionPath(drawing.marks.white, k)} fill={white} /> : null}
        {drawing.marks?.black ? <Path d={regionPath(drawing.marks.black, k)} fill={black} /> : null}
      </G>
      {badges.map(({ from, at }, n) => {
        // The leader ends at the number's ring, not under it.
        const end = BADGE_R / (Math.hypot(at[0] - from[0], at[1] - from[1]) || 1);
        return (
          <G key={`n${n}`}>
            <Line
              x1={from[0]}
              y1={from[1]}
              x2={at[0] - (at[0] - from[0]) * end}
              y2={at[1] - (at[1] - from[1]) * end}
              stroke={ink.stroke}
              strokeWidth={1.25}
            />
            <Circle cx={from[0]} cy={from[1]} r={2.5} fill={ink.stroke} />
            <Circle
              cx={at[0]}
              cy={at[1]}
              r={BADGE_R}
              fill={ink.paper}
              stroke={ink.stroke}
              strokeWidth={1.5}
            />
            <SvgText
              x={at[0]}
              y={at[1] + FONT * 0.36}
              fontFamily={FAMILY}
              fontSize={FONT}
              fontWeight="700"
              fill={ink.stroke}
              textAnchor="middle"
            >
              {String(n + 1)}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/** "Abbildung: Pflanzenzelle, 4 Teile nummeriert." — never the names of the numbered parts. */
export function describeSchematic(figure: SchematicFigure, t: T): string {
  const lang = currentLocale();
  const names = schematic(figure.d).names;
  const name = lang in names ? names[lang as keyof typeof names] : names.de;
  const count = schematicNumbered(figure).length;
  return count > 0
    ? t('figure.schematic_numbered', { name, count })
    : t('figure.schematic', { name });
}
