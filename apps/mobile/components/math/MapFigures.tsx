// A stumme Karte (issue #251): Germany's 16 Länder, the countries of Europe or the continents, as
// an atlas prints them — no names on it, the marked regions filled. Nothing here decides anything:
// every region and its shape is Natural Earth data in packages/shared-math (`maps.ts`), the names
// the server checked the question against. The shapes load with the first map
// (`lib/math/useMapShapes.ts`); until then the map keeps its room. `describeMap` says in words
// what it shows.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import {
  mapHeight,
  mapMarked,
  mapRegionName,
  mapRegions,
} from '../../../../packages/shared-math/src/maps.js';
import { REGION_FRAME, regionPath } from '../../../../packages/shared-math/src/regions.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { useMapShapes } from '../../lib/math/useMapShapes.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';

export type MapFigure = Extract<Figure, { type: 'map' }>;
type T = (key: string, values?: Record<string, string | number>) => string;

/** How strongly the land is tinted: the marked region stands out in the full figure fill. */
const LAND = 0.35;

/** The drawing's height at `width`: the view's own proportions. */
export function mapDrawHeight(figure: MapFigure, width: number): number {
  return Math.round((mapHeight(figure.v) * width) / REGION_FRAME);
}

export function MapBody({ figure, width }: { figure: MapFigure; width: number }) {
  const { figure: ink } = useTheme();
  const shapes = useMapShapes()?.MAP_SHAPES[figure.v];
  const height = mapDrawHeight(figure, width);
  if (!shapes) return <View style={{ width, height }} />;
  const k = width / REGION_FRAME;
  const marked = new Set(mapMarked(figure));
  const paths = shapes.regions.map((s) => regionPath(s.rings, k));
  // Länder and countries draw their borders on top, as an atlas does. A continent is many
  // countries: its coast is drawn under the land, and each country is filled with a seam of its
  // own colour, so neither a border nor the hairline between two simplified neighbours shows.
  const seam = shapes.borders ? 0 : 1.5;
  return (
    <Svg width={width} height={height}>
      {shapes.context.length > 0 ? (
        <Path d={regionPath(shapes.context, k)} fill={ink.grid} stroke="none" />
      ) : null}
      {shapes.borders
        ? null
        : paths.map((d, i) => (
            <Path key={`c${i}`} d={d} fill="none" stroke={ink.axis} strokeWidth={3.5} />
          ))}
      {/* Opaque first, so the coast drawn under it shows only at the edge of the land… */}
      {shapes.borders
        ? null
        : paths.map((d, i) => (
            <Path key={`p${i}`} d={d} fill={ink.paper} stroke={ink.paper} strokeWidth={seam} />
          ))}
      {/* …then the tint as one layer: where two seams overlap it does not darken. */}
      <G opacity={LAND}>
        {paths.map((d, i) => (
          <Path key={`l${i}`} d={d} fill={ink.fill} stroke={ink.fill} strokeWidth={seam} />
        ))}
      </G>
      {paths.map((d, i) =>
        marked.has(i) ? (
          <Path key={`m${i}`} d={d} fill={ink.fill} stroke={ink.fill} strokeWidth={seam} />
        ) : null,
      )}
      {shapes.borders
        ? paths.map((d, i) => (
            <Path
              key={`b${i}`}
              d={d}
              fill="none"
              stroke={ink.axis}
              strokeWidth={0.8}
              strokeLinejoin="round"
            />
          ))
        : null}
    </Svg>
  );
}

/** "Karte: Deutschland mit den 16 Bundesländern, ohne Namen. Markiert: Bayern." */
export function describeMap(figure: MapFigure, t: T): string {
  const lang = currentLocale();
  const count = mapRegions(figure.v).length;
  const what = t(`figure.map_${figure.v}`, { count });
  const marked = mapMarked(figure).map((i) => mapRegionName(figure.v, i, lang));
  return marked.length > 0
    ? `${what} ${t('figure.map_marked', { names: marked.join(', ') })}`
    : what;
}
