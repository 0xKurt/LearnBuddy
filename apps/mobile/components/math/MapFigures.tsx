// A stumme Karte (issue #251): Germany's 16 Länder, the countries of Europe or the continents, as
// an atlas prints them — no names on it, the marked regions filled. Since #429 a map can show a
// layer of places on its land instead — the capitals as dots, the rivers as blue lines, the
// mountain ranges in the atlas brown, cut to the land — the marked ones in the figure's accent; or
// its Gradnetz with the degrees at the frame's edge and the marked crossings as dots; and a
// closer Ausschnitt of Europe is drawn like any view. Her own Land (`home`, #429), where code
// chose to show it, is outlined dashed in the accent — never filled, so it is never read as the
// marked one, and never solid, so never as her tap. Nothing here decides anything:
// every region and its shape is Natural Earth data in packages/shared-math (`maps.ts`), the names
// the server checked the question against. The shapes and the names load with the first map
// (`lib/math/useMapShapes.ts`, `useFigureNames.ts`, #440); until both are there the map keeps its
// room and draws nothing. `describeMap` says in words what it shows.

import type { Figure } from '@learnbuddy/shared-types/contracts';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';

import {
  gridAt,
  gridStep,
  mapGrid,
  type MapGridShape,
} from '../../../../packages/shared-math/src/mapGrid.js';
import {
  mapHeight,
  mapLayer,
  mapMarked,
  mapPlaceName,
  mapRegion,
  mapRegions,
  type MapPlaceLayer,
  type MapViewShape,
} from '../../../../packages/shared-math/src/maps.js';
import {
  linePath,
  REGION_FRAME,
  regionName,
  regionPath,
} from '../../../../packages/shared-math/src/regions.js';
import type { FigureNames } from '../../../../packages/shared-math/src/figureNames.js';
import { currentLocale } from '../../lib/i18n/index.js';
import type { Translate } from '../../lib/i18n/index.js';
import { gridLabels } from '../../lib/math/mapGridLabels.js';
import { useFigureNames } from '../../lib/math/useFigureNames.js';
import { useMapShapes } from '../../lib/math/useMapShapes.js';
import { useSvgId } from '../../lib/theme/svgId.js';
import { useTheme } from '../../lib/theme/ThemeProvider.js';
import { HaloText, SMALL } from './figureText.js';

export type MapFigure = Extract<Figure, { type: 'map' }>;

/** How strongly the land is tinted: the marked region stands out in the full figure fill. */
const LAND = 0.35;
/**
 * Her Land's outline (#429): wider than a border and dashed — a solid accent line is her tap's
 * mark, a fill the marked place — so it reads as neither.
 */
const HOME = 2.2;
const HOME_DASH = '6 4';

/** The index of her Land on the map (#429), or null where code marked none. */
function mapHome(names: FigureNames, figure: MapFigure): number | null {
  return figure.home ? mapRegion(names, figure.v, figure.home) : null;
}

/** The drawing's height at `width`: the view's own proportions. */
export function mapDrawHeight(figure: MapFigure, width: number): number {
  return Math.round((mapHeight(figure.v) * width) / REGION_FRAME);
}

export function MapBody({ figure, width }: { figure: MapFigure; width: number }) {
  const { figure: ink } = useTheme();
  const land = useSvgId('land');
  const shapes = useMapShapes()?.MAP_SHAPES[figure.v];
  const names = useFigureNames(figure);
  const height = mapDrawHeight(figure, width);
  if (!shapes || !names) return <View style={{ width, height }} />;
  const k = width / REGION_FRAME;
  const layer = mapLayer(figure);
  const marks = mapMarked(names, figure);
  // The marked places: regions are filled here, a layer of places marks its own (`Places`).
  const marked = new Set(layer === 'regions' ? marks : []);
  const paths = shapes.regions.map((s) => regionPath(s.rings, k));
  const home = mapHome(names, figure);
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
      {home !== null ? (
        <Path
          d={paths[home]}
          fill="none"
          stroke={ink.point}
          strokeWidth={HOME}
          strokeDasharray={HOME_DASH}
          strokeLinejoin="round"
        />
      ) : null}
      {layer === 'grid' ? (
        <Graticule
          figure={figure}
          grid={shapes.grid}
          marked={marks}
          width={width}
          height={height}
        />
      ) : layer === 'regions' ? null : (
        <Places shapes={shapes} layer={layer} marked={new Set(marks)} k={k} land={land} />
      )}
    </Svg>
  );
}

/**
 * The Gradnetz (#429): its meridians and parallels in the atlas blue — never the grey of a
 * border —, each degree on a paper chip where its line leaves the frame (`gridLabels`), the marked
 * crossings as dots in the accent.
 */
function Graticule({
  figure,
  grid,
  marked,
  width,
  height,
}: {
  figure: MapFigure;
  grid: MapGridShape | undefined;
  marked: readonly number[];
  width: number;
  height: number;
}) {
  const { figure: ink, palette } = useTheme();
  const values = mapGrid(figure.v);
  if (!grid || !values) return null;
  const k = width / REGION_FRAME;
  const lines = [...grid.lon, ...grid.lat].flatMap((l) => l.lines);
  return (
    <>
      <Path
        d={linePath(lines, k)}
        fill="none"
        stroke={ink.wetDeep}
        strokeOpacity={0.7}
        strokeWidth={0.8}
      />
      {gridLabels(values, grid, width, height, SMALL, currentLocale()).map((l, i) => (
        <G key={i}>
          {/* A paper chip: the label interrupts its line, as in an atlas. */}
          <Rect
            x={l.box.x0}
            y={l.box.y0}
            width={l.box.x1 - l.box.x0}
            height={l.box.y1 - l.box.y0}
            fill={ink.paper}
          />
          <HaloText
            x={l.x}
            y={l.y}
            anchor={l.anchor}
            text={l.text}
            size={SMALL}
            weight="400"
            color={ink.label}
          />
        </G>
      ))}
      {marked.map((c) => {
        const p = gridAt(figure.v, grid, c);
        return p ? (
          <Circle
            key={c}
            cx={p[0] * k}
            cy={p[1] * k}
            r={5.5}
            fill={ink.point}
            stroke={palette.paper}
            strokeWidth={2}
          />
        ) : null;
      })}
    </>
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
 * "Karte: Deutschland mit den 16 Bundesländern, ohne Namen. Markiert: Bayern." — and "Dein
 * Bundesland: Hessen." where code outlined hers (#429); with its layer
 * of places (#429): "… Die großen Flüsse sind Linien. Markiert: Rhein."; with its Gradnetz: "…
 * Mit Gradnetz, Linien alle 10°. Markiert: 50° N, 10° O."
 */
export function describeMap(figure: MapFigure, t: Translate, names: FigureNames): string {
  const lang = currentLocale();
  const count = mapRegions(names, figure.v).length;
  const layer = mapLayer(figure);
  const grid = layer === 'grid' ? mapGrid(figure.v) : null;
  const parts = [t(`figure.map_${figure.v}`, { count })];
  if (grid) parts.push(t('figure.map_grid', { step: gridStep(grid) }));
  else if (layer !== 'regions') parts.push(t(`figure.map_${layer}`));
  const marked = mapMarked(names, figure).map((i) => mapPlaceName(names, figure, i, lang));
  if (marked.length > 0) parts.push(t('figure.map_marked', { names: marked.join(', ') }));
  const home = mapHome(names, figure);
  if (home !== null) {
    parts.push(t('figure.map_home', { name: regionName(mapRegions(names, figure.v), home, lang) }));
  }
  return parts.join(' ');
}
