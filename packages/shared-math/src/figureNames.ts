// What the places of a figure are called (issue #440): the regions and places of the maps (#251,
// #429) and the parts of the labelled pictures (#252), in five languages. Data, never a model's
// word — and ~30 KB of it, so it is handed in rather than imported: the server passes
// `FIGURE_NAMES` (`figureNames.data.ts`), the app the same object once it is loaded with the first
// map or picture (`useFigureNames`). Every function that resolves a name takes it as its first
// argument (`maps.ts`, `schematics.ts`, `tap.ts`); there is no second way to the names.
//
// Dependency-free on purpose: the app imports it by path, like `tap.ts`.

import { isMap, type MapNames, type MapPlaceNames } from './maps.js';
import { isSchematic, type SchematicNames } from './schematics.js';

export type FigureNames = {
  /** The regions of each map view, in drawing order (`MAP_NAMES`). */
  maps: MapNames;
  /** The capitals, rivers and mountain ranges of Germany and Europe (`MAP_PLACE_NAMES`, #429). */
  mapPlaces: MapPlaceNames;
  /** Every drawing of the picture library and its parts (`SCHEMATIC_NAMES`). */
  pictures: SchematicNames;
};

/** Whether a figure is drawn, described and answered with the names: a map or a picture. */
export function needsFigureNames(f: { type: string }): boolean {
  return isMap(f) || isSchematic(f);
}
