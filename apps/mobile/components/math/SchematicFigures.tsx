// A labelled picture (issue #252): a drawing of the picture library — a plant cell, an eye, a
// bicycle — in the app's pastels, with numbers on chosen parts. Nothing here decides anything:
// every part, its name and its outline are packages/shared-math (`schematics.ts`), the library
// the server checked the question against. The drawings come with the first picture
// (`useSchematicShapes`); until then the picture keeps its room. `describeSchematic` says in words what it shows — the
// drawing and how many parts are numbered, never their names (naming them is the task).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { REGION_FRAME, regionPath } from '../../../../packages/shared-math/src/regions.js';
import { schematic, schematicNumbered } from '../../../../packages/shared-math/src/schematics.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { useSchematicShapes } from '../../lib/math/useSchematicShapes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY } from './figureText.js';

export type SchematicFigure = Extract<Figure, { type: 'schematic' }>;
type T = (key: string, values?: Record<string, string | number>) => string;

/** How far a number stands off its part, and how big it is, in the frame's units. */
const OFF = 70;
const BADGE = 34;

/** Where the number of a part stands: off the part, away from the drawing's middle. */
function badgeAt(height: number, at: readonly [number, number]): [number, number] {
  const cx = REGION_FRAME / 2;
  const cy = height / 2;
  const dx = at[0] - cx;
  const dy = at[1] - cy;
  const len = Math.hypot(dx, dy) || 1;
  const clamp = (v: number, hi: number) => Math.max(BADGE + 4, Math.min(hi - BADGE - 4, v));
  return [clamp(at[0] + (OFF * dx) / len, REGION_FRAME), clamp(at[1] + (OFF * dy) / len, height)];
}

/** The drawing's height at `width`: its own proportions. */
function schematicDrawHeight(figure: SchematicFigure, width: number): number {
  return Math.round((schematic(figure.d).height * width) / REGION_FRAME);
}

export function SchematicBody({ figure, width }: { figure: SchematicFigure; width: number }) {
  const { figure: ink } = useTheme();
  const drawing = useSchematicShapes()?.SCHEMATIC_SHAPES[figure.d];
  const frameHeight = schematic(figure.d).height;
  const k = width / REGION_FRAME;
  const height = schematicDrawHeight(figure, width);
  if (!drawing) return <View style={{ width, height }} />;
  const paths = drawing.parts.map((p) => regionPath(p.rings, k));
  const tone = (t: number) => (t < 0 ? ink.stroke : (ink.slices[t] ?? ink.fill));
  return (
    <Svg width={width} height={height}>
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
      {schematicNumbered(figure).map((index, n) => {
        const p = drawing.parts[index];
        if (!p) return null;
        const [bx, by] = badgeAt(frameHeight, p.at);
        return (
          <G key={`n${n}`}>
            <Line
              x1={p.at[0] * k}
              y1={p.at[1] * k}
              x2={bx * k}
              y2={by * k}
              stroke={ink.stroke}
              strokeWidth={1.5}
            />
            <Circle cx={p.at[0] * k} cy={p.at[1] * k} r={3} fill={ink.stroke} />
            <Circle
              cx={bx * k}
              cy={by * k}
              r={BADGE * k}
              fill={ink.paper}
              stroke={ink.stroke}
              strokeWidth={1.5}
            />
            <SvgText
              x={bx * k}
              y={by * k + BADGE * k * 0.42}
              fontFamily={FAMILY}
              // token-exempt: the number fills its badge, which scales with the drawing
              fontSize={BADGE * k * 1.15}
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
