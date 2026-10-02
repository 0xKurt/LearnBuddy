// The graticule of an area (issue #251): parallels and meridians every `graticule` degrees,
// straight lines in the area's projection, and the words for a position ("52° N, 13° O").

import { mapArea, toUnits, type MapAreaId } from './features.js';

export type GraticuleLine = { deg: number; at: number };

/** Parallels (y in units) and meridians (x in units) that cross the area. */
export function graticule(area: MapAreaId): { lats: GraticuleLine[]; lons: GraticuleLine[] } {
  const a = mapArea(area);
  const s = a.graticule;
  const lats: GraticuleLine[] = [];
  const lons: GraticuleLine[] = [];
  for (let d = Math.ceil(a.south / s) * s; d <= a.north + 1e-9; d += s)
    lats.push({ deg: Math.round(d * 1e6) / 1e6, at: toUnits(a, d, a.west)[1] });
  for (let d = Math.ceil(a.west / s) * s; d <= a.east + 1e-9; d += s)
    lons.push({ deg: Math.round(d * 1e6) / 1e6, at: toUnits(a, a.north, d)[0] });
  return { lats, lons };
}

/**
 * How exactly a position can be read on an area's graticule, in degrees either way: half the
 * distance between two lines on the world and Europe maps (she estimates inside a square),
 * one degree on Germany (lines every degree).
 */
export const COORD_TOLERANCE: Record<MapAreaId, number> = { world: 5, europe: 2.5, germany: 1 };

/** The range she can type: whole degrees within the area, rounded outwards. */
export function coordRange(area: MapAreaId): {
  lat: [number, number];
  lon: [number, number];
} {
  const a = mapArea(area);
  return {
    lat: [Math.floor(a.south), Math.ceil(a.north)],
    lon: [Math.floor(a.west), Math.ceil(a.east)],
  };
}
