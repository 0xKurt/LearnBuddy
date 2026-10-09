// Which Ausschnitt a question on a map is asked on (#429). A school map of Europe is 320 pt wide on
// a 360 phone: Luxembourg, the Balkans and the Baltic are too small there for a finger, and so are
// half of the capitals. The model writes the map it means (`europe`); code takes the whole map
// where the question can be answered on it, else the first closer Ausschnitt (`eu_central`,
// `eu_southeast`, `eu_north`) where it can — the place to tap big enough, every marked place on it.
// A question no Ausschnitt can carry is dropped (`mapCheck.ts`), never repaired. A question on the
// Gradnetz stays on its map (the closer Ausschnitte have none): its crossings must be far enough
// apart there (`gridTappable`).
//
// Needs the shapes: the server's (the app draws the view it is given and never chooses one).

import type { FigureNames } from './figureNames.js';
import { gridTappable } from './mapGrid.js';
import { MAP_SHAPES } from './mapShapes.data.js';
import {
  EUROPE_CLOSER_VIEWS,
  isGridMap,
  mapHeight,
  mapMarked,
  mapTapSet,
  type MapFig,
  type MapView,
} from './maps.js';
import { regionTappable, TAP_TARGET } from './regions.js';

/** Whether place `i` of the question stands big enough on view `v` — a region, a place or a crossing. */
function tappable(f: MapFig, v: MapView, i: number): boolean {
  const shape = MAP_SHAPES[v];
  if (isGridMap(f)) return shape.grid !== undefined && gridTappable(v, shape.grid, i, mapHeight(v));
  const set = mapTapSet(shape, f);
  return set !== null && regionTappable(set, i, mapHeight(v), TAP_TARGET.map);
}

/**
 * The view to ask the question on, or null when none can carry it: every marked place stands big
 * enough to see and to tell apart (as big as a place to tap), and so does `key`, the place to tap
 * (null for a question that names a marked place).
 */
export function mapZoom(names: FigureNames, f: MapFig, key: number | null): MapView | null {
  const views: readonly MapView[] = f.v === 'europe' ? ['europe', ...EUROPE_CLOSER_VIEWS] : [f.v];
  const wanted = [...mapMarked(names, f), ...(key === null ? [] : [key])];
  return views.find((v) => wanted.every((i) => tappable(f, v, i))) ?? null;
}
