// The names of the maps and pictures as one object (issue #440, `figureNames.ts`): the server
// imports it, the app loads it with the first map or picture (`useFigureNames`) — no part of the
// start bundle.

import type { FigureNames } from './figureNames.js';
import { MAP_NAMES, MAP_PLACE_NAMES } from './mapNames.data.js';
import { SCHEMATIC_NAMES } from './schematics.data.js';

export const FIGURE_NAMES: FigureNames = {
  maps: MAP_NAMES,
  mapPlaces: MAP_PLACE_NAMES,
  pictures: SCHEMATIC_NAMES,
};
