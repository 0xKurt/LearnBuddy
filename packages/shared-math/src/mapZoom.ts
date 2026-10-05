// Which Ausschnitt a question on a map is asked on (#429). A school map of Europe is 320 pt wide on
// a 360 phone: Luxembourg, the Balkans and the Baltic are too small there for a finger, and so are
// half of the capitals. The model writes the map it means (`europe`); code takes the whole map
// where the question can be answered on it, else the first closer Ausschnitt (`eu_central`,
// `eu_southeast`, `eu_north`) where it can — the place to tap big enough, every marked place on it.
// A question no Ausschnitt can carry is dropped (`mapCheck.ts`), never repaired.
//
// Needs the shapes: the server's (the app draws the view it is given and never chooses one).

import { MAP_SHAPES } from './mapShapes.data.js';
import {
  EUROPE_CLOSER_VIEWS,
  mapHeight,
  mapMarked,
  mapTapSet,
  type MapFig,
  type MapView,
} from './maps.js';
import { regionTappable } from './regions.js';

/**
 * The view to ask the question on, or null when none can carry it: every marked place stands big
 * enough to see and to tell apart (as big as a place to tap), and so does `key`, the place to tap
 * (null for a question that names a marked place).
 */
export function mapZoom(f: MapFig, key: number | null): MapView | null {
  const views: readonly MapView[] = f.v === 'europe' ? ['europe', ...EUROPE_CLOSER_VIEWS] : [f.v];
  const wanted = [...mapMarked(f), ...(key === null ? [] : [key])];
  return (
    views.find((v) => {
      const set = mapTapSet(MAP_SHAPES[v], f);
      return set !== null && wanted.every((i) => regionTappable(set, i, mapHeight(v)));
    }) ?? null
  );
}
