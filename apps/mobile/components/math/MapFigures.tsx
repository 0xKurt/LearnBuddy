// A stumme Karte (issue #251): Germany's 16 Länder, the countries of Europe or the continents, as
// an atlas prints them — no names on it, the marked regions filled. Since #429 a map can show a
// layer of places on its land instead — the capitals as dots, the rivers as blue lines, the
// mountain ranges in the atlas brown, cut to the land — the marked ones in the figure's accent; and
// a closer Ausschnitt of Europe is drawn like any view. Nothing here decides anything:
// every region and its shape is Natural Earth data in packages/shared-math (`maps.ts`), the names
// the server checked the question against. The shapes load with the first map
// (`lib/math/useMapShapes.ts`); until then the map keeps its room. `describeMap` says in words
// what it shows.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path } from 'react-native-svg';

import {
  mapHeight,
  mapLayer,
  mapMarked,
  mapPlaceName,
  mapRegions,
  type MapPlaceLayer,
  type MapViewShape,
} from '../../../../packages/shared-math/src/maps.js';
import { REGION_FRAME, regionPath } from '../../../../packages/shared-math/src/regions.js';
import { currentLocale } from '../../lib/i18n/index.js';
import { useMapShapes } from '../../lib/math/useMapShapes.js';
import { useSvgId } from '../../lib/theme/svgId.js';
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
  const land = useSvgId('land');
  const shapes = useMapShapes()?.MAP_SHAPES[figure.v];
  const height = mapDrawHeight(figure, width);
  if (!shapes) return <View style={{ width, height }} />;
  const k = width / REGION_FRAME;
  const layer = mapLayer(figure);
  // The marked places: regions are filled here, a layer of places marks its own (`Places`).
  const marked = new Set(layer === 'regions' ? mapMarked(figure) : []);
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
      {layer === 'regions' ? null : (
        <Places
          shapes={shapes}
          layer={layer}
          marked={new Set(mapMarked(figure))}
          k={k}
          land={land}
        />
      )}
    </Svg>
  );
}

/**
 * A layer of places on the land (#429): ranges and rivers cut to the land (the map shows nothing
 * beyond it), the capitals as dots on top. The marked ones in the accent, wider.
 */
function Places({
  shapes,
  layer,
  marked,
  k,
  land,
}: {
  shapes: MapViewShape;
  layer: MapPlaceLayer;
  marked: ReadonlySet<number>;
  k: number;
  land: string;
}) {
  const { figure: ink, palette } = useTheme();
  const places = shapes.places?.[layer] ?? [];
  if (layer === 'cities') {
    return (
      <>
        {places.map((p, i) =>
          p.rings.length === 0 ? null : (
            <Circle
              key={`c${i}`}
              cx={p.at[0] * k}
              cy={p.at[1] * k}
              r={marked.has(i) ? 5.5 : 3.5}
              fill={marked.has(i) ? ink.point : ink.stroke}
              stroke={palette.paper}
              strokeWidth={marked.has(i) ? 2 : 1}
            />
          ),
        )}
      </>
    );
  }
  const shore = regionPath([...shapes.regions.flatMap((r) => r.rings), ...shapes.context], k);
  return (
    <>
      <Defs>
        <ClipPath id={land}>
          <Path d={shore} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${land})`}>
        {places.map((p, i) => {
          const d = regionPath(p.rings, k);
          if (layer === 'rivers') {
            return (
              <Path
                key={`r${i}`}
                d={d}
                fill="none"
                stroke={marked.has(i) ? ink.point : ink.wetDeep}
                strokeWidth={marked.has(i) ? 3.5 : 1.6}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          }
          return (
            <Path
              key={`m${i}`}
              d={d}
              fill={marked.has(i) ? ink.point : ink.relief}
              fillOpacity={marked.has(i) ? 0.55 : 0.85}
              stroke={marked.has(i) ? ink.point : 'none'}
              strokeWidth={2}
            />
          );
        })}
      </G>
    </>
  );
}

/**
 * "Karte: Deutschland mit den 16 Bundesländern, ohne Namen. Markiert: Bayern." — with its layer
 * of places (#429): "… Die großen Flüsse sind Linien. Markiert: Rhein."
 */
export function describeMap(figure: MapFigure, t: T): string {
  const lang = currentLocale();
  const count = mapRegions(figure.v).length;
  const layer = mapLayer(figure);
  const parts = [
    t(`figure.map_${figure.v}`, { count }),
    ...(layer === 'regions' ? [] : [t(`figure.map_${layer}`)]),
  ];
  const marked = mapMarked(figure).map((i) => mapPlaceName(figure, i, lang));
  if (marked.length > 0) parts.push(t('figure.map_marked', { names: marked.join(', ') }));
  return parts.join(' ');
}
