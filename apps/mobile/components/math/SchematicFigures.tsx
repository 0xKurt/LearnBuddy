// A labelled picture (issue #252): a picture of the library — a plant cell, an eye, a bicycle —
// with numbers on the parts asked for, each joined to its part by a leader line. Every picture is
// a real image with its anchors as data (`SchematicPicture.tsx`, #599) — but the circuit, the one
// picture no free image exists for (`SCHEMATIC_DRAWN`, shared-math): that one is still drawn here
// in the app's pastels, its numbers beside it as a schoolbook prints them (`schematicLayout.ts`).
// Nothing here decides anything: every part and its name are packages/shared-math
// (`schematics.ts`), the library the server checked the question against. The drawing and the
// names come with the first picture (`useSchematicShapes`, `useFigureNames`, #440); until both are
// there the picture keeps its room and draws nothing. `describeSchematic` says in words what it
// shows — the picture and how many parts are numbered, never their names (naming them is the
// task).

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import type { FigureNames } from '../../../../packages/shared-math/src/figureNames.js';
import { regionPath } from '../../../../packages/shared-math/src/regions.js';
import {
  isImageSchematic,
  schematic,
  schematicNumbered,
  type SchematicDrawnId,
} from '../../../../packages/shared-math/src/schematics.js';
import { currentLocale } from '../../lib/i18n/index.js';
import type { Translate } from '../../lib/i18n/index.js';
import { BADGE_R, schematicLayout } from '../../lib/math/schematicLayout.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import { useSchematicShapes } from '../../lib/math/useSchematicShapes.js';
import { isDarkBackground } from '../../lib/theme/luminance.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { FAMILY, FONT } from './figureText.js';
import { SchematicPicture } from './SchematicPicture.js';

export type SchematicFigure = Extract<Figure, { type: 'schematic' }>;

type BodyProps<F extends SchematicFigure> = {
  figure: F;
  /** The width FigureView gives the picture, already shrunk by `scale`. */
  width: number;
  /**
   * How far FigureView shrinks it. A drawing with numbers keeps its whole width and is drawn
   * `scale` times its height between its columns: the columns do not shrink with it, so a
   * narrower picture came out shorter than the room it was shrunk for (#462). One to tap keeps
   * the width it is given — the tap layer lies over exactly that. An image's height follows its
   * width alone.
   */
  scale?: number;
};

/** An image with its numbers over it — or, for the circuit alone, our drawing of it. */
export function SchematicBody({ figure, width, scale }: BodyProps<SchematicFigure>) {
  const { d } = figure;
  return isImageSchematic(d) ? (
    <SchematicPicture figure={{ ...figure, d }} width={width} />
  ) : (
    <SchematicDrawing figure={{ ...figure, d }} width={width} scale={scale} />
  );
}

function SchematicDrawing({
  figure,
  width,
  scale = 1,
}: BodyProps<SchematicFigure & { d: SchematicDrawnId }>) {
  const { figure: ink } = useTheme();
  const shape = useSchematicShapes()?.SCHEMATIC_SHAPES[figure.d];
  const names = useFigureNames(figure);
  const loaded = shape && names ? { drawing: shape, names } : null;
  const numbered = figure.n.length > 0;
  const room = numbered ? width / scale : width;
  const natural = schematicLayout(figure, room, null).height;
  const { k, x0, y0, height, badges } = schematicLayout(
    figure,
    room,
    loaded,
    numbered ? natural * scale : Infinity,
  );
  if (!loaded) return <View style={{ width: room, height }} />;
  const { drawing } = loaded;
  const paths = drawing.parts.map((p) => regionPath(p.rings, k));
  const tone = (t: number) => (t < 0 ? ink.stroke : (ink.slices[t] ?? ink.fill));
  const night = isDarkBackground(ink.paper);
  const [white, black] = night ? [ink.stroke, ink.paper] : [ink.paper, ink.stroke];
  return (
    <Svg width={room} height={height}>
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
        {/* What is drawn on the parts without being one: the battery's plus and minus, the bulb's
            wire — white and black in either room. */}
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
export function describeSchematic(
  figure: SchematicFigure,
  t: Translate,
  names: FigureNames,
): string {
  const lang = currentLocale();
  const titles = schematic(names, figure.d).names;
  const name = lang in titles ? titles[lang as keyof typeof titles] : titles.de;
  const count = schematicNumbered(names, figure)?.length ?? 0;
  return count > 0
    ? t('figure.schematic_numbered', { name, count })
    : t('figure.schematic', { name });
}
