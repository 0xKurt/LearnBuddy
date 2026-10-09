// The Gradnetz of a map (issue #429): its meridians and parallels, and the one rule for how a point
// where two of them cross is written and read. docs/architecture.md §Maps.
//
// A map of Germany, Europe or the world can be about its Gradnetz (`l: 'grid'`): "Welche
// Koordinaten hat der markierte Punkt?", "Tippe auf 50° N, 10° O". Its places are the CROSSINGS —
// every degree on Germany, every ten on Europe, every thirty on the world, as `scripts/maps.mjs`
// draws them from the projection of each view —, so a question is answered by tapping a crossing
// like a point of a coordinate system: the grid's two axes are its meridians and its parallels
// (`tap.ts`). A coordinate is never a fact about the world here: the crossing is where two drawn
// lines meet, and code decides whether it stands on the map and is big enough for a finger.
//
// Written: latitude first, "50° N, 10° O", a zero without a letter ("0°, 20° W"). The letters are
// the one place where the five languages disagree: German writes east "O" (Ost), French, Spanish
// and Italian write WEST "O" (ouest, oeste, ovest). Code therefore writes east "O" in German and
// "E" in the others, and west "W" in all five — so whatever code writes reads one way everywhere
// (`gridText`, read back with 'de'). What SHE types is read in her language (`gridParse`).
//
// Dependency-free on purpose: the app imports it by path, like `maps.ts`.

import { MAP_GRIDS } from './maps.data.js';
import type { MapView } from './maps.js';
import { REGION_LANGS, regionTapLeast, TAP_TARGET, type RegionLang } from './regions.js';

/** The degrees of a view's meridians (west to east) and parallels (south to north). */
export type MapGridValues = { lon: readonly number[]; lat: readonly number[] };
export type MapGrids = Readonly<Partial<Record<MapView, MapGridValues>>>;
/** A frame point [x, y]. */
type At = readonly [number, number];
/**
 * A meridian or a parallel in the frame: its runs as open lines "x y x y …", and the end of it
 * where its degree is written (`scripts/maps.mjs`: at the frame's edge); null where none is.
 */
export type MapGridLine = { lines: readonly string[]; label: At | null };
export type MapGridShape = {
  lon: readonly MapGridLine[];
  lat: readonly MapGridLine[];
  /** Where each crossing stands, parallel by parallel (`MAP_GRIDS` order); null outside the frame. */
  at: readonly (readonly (At | null)[])[];
};
/** A crossing in degrees: north and east positive. */
export type GridPoint = { lat: number; lon: number };

/** The Gradnetz of view `v`, or null (a closer Ausschnitt of Europe has none). */
export function mapGrid(v: MapView): MapGridValues | null {
  return MAP_GRIDS[v] ?? null;
}

/** How many degrees apart the lines of a Gradnetz are (the same both ways). */
export function gridStep(g: MapGridValues): number {
  return Math.abs((g.lat[1] ?? 0) - (g.lat[0] ?? 0)) || 1;
}

/**
 * The index of the crossing of meridian `i` and parallel `j` — parallel by parallel, west to east
 * within each: the index a question on the grid names its places by (`maps.ts`, like the index of
 * a region). -1 where the view has no such crossing.
 */
export function gridCellIndex(v: MapView, i: number, j: number): number {
  const g = mapGrid(v);
  return g && i >= 0 && j >= 0 && i < g.lon.length && j < g.lat.length ? j * g.lon.length + i : -1;
}

/** The meridian and the parallel of crossing `index`, or null where the view has none. */
function gridCell(v: MapView, index: number): [number, number] | null {
  const g = mapGrid(v);
  if (!g || index < 0 || index >= g.lon.length * g.lat.length) return null;
  return [index % g.lon.length, Math.floor(index / g.lon.length)];
}

/** A crossing by its index, in degrees. */
export function gridCrossing(v: MapView, index: number): GridPoint | null {
  const cell = gridCell(v, index);
  const g = mapGrid(v);
  return cell && g ? { lat: g.lat[cell[1]]!, lon: g.lon[cell[0]]! } : null;
}

/** The index of the crossing at `p`, or null when no two lines of the grid cross there. */
export function gridIndex(v: MapView, p: GridPoint): number | null {
  const g = mapGrid(v);
  const index = g ? gridCellIndex(v, g.lon.indexOf(p.lon), g.lat.indexOf(p.lat)) : -1;
  return index < 0 ? null : index;
}

/** East in each language as code writes it; west is "W" in all five (see above). */
const EAST: Readonly<Record<RegionLang, string>> = { de: 'O', en: 'E', fr: 'E', es: 'E', it: 'E' };

/** One degree as an atlas writes it: "50° N", "10° O", "20° W", "0°" (lang: German elsewhere). */
export function gridDegree(value: number, axis: 'lat' | 'lon', lang: string): string {
  const l: RegionLang = (REGION_LANGS as readonly string[]).includes(lang)
    ? (lang as RegionLang)
    : 'de';
  if (value === 0 || Math.abs(value) === 180) return `${Math.abs(value)}°`;
  const letter = axis === 'lat' ? (value > 0 ? 'N' : 'S') : value > 0 ? EAST[l] : 'W';
  return `${Math.abs(value)}° ${letter}`;
}

/** A crossing as code writes it in `lang`: "50° N, 10° O" (latitude first). */
export function gridText(p: GridPoint, lang: string): string {
  return `${gridDegree(p.lat, 'lat', lang)}, ${gridDegree(p.lon, 'lon', lang)}`;
}

/** What a hemisphere letter means in `lang`: its axis and sign, or null where it is none there. */
function hemisphere(letter: string, lang: string | null): ['lat' | 'lon', 1 | -1] | null {
  switch (letter.toUpperCase()) {
    case 'N':
      return ['lat', 1];
    case 'S':
      return ['lat', -1];
    case 'E':
      return ['lon', 1];
    case 'W':
      return ['lon', -1];
    case 'O':
      // Ost in German; ouest, oeste, ovest in the Romance languages; no letter in English.
      if (lang === 'de') return ['lon', 1];
      return lang === 'fr' || lang === 'es' || lang === 'it' ? ['lon', -1] : null;
    default:
      return null;
  }
}

/** One written degree: "50° N", "50N", "0°" — its value and, with a letter, its axis. */
type Degree = { value: number; axis: 'lat' | 'lon' | null };

const DEGREE = /^(\d{1,3})\s*°?\s*([a-z])?$/i;

function degreeOf(text: string, lang: string | null): Degree | null {
  const m = DEGREE.exec(text.trim());
  if (!m) return null;
  const value = Number(m[1]);
  if (m[2] === undefined) return value === 0 ? { value, axis: null } : null;
  const h = hemisphere(m[2], lang);
  return h ? { value: value * h[1], axis: h[0] } : null;
}

/**
 * A crossing as written in `lang`: "50° N, 10° O", "50°N 10°E", "10° W; 40° N" (either order), "0°,
 * 20° W". Whole degrees with a hemisphere letter each (a zero needs none); O as `lang` means it,
 * so in English it is no letter. Null for anything else — "50° nördliche Breite" is language, and
 * reading it needs a word list (CLAUDE.md rule 3): that goes to the tutor. What code wrote reads
 * back with 'de' whatever her language (see above).
 */
export function gridParse(text: string, lang: string | null): GridPoint | null {
  const m = /^\s*(\d{1,3}\s*°?\s*[a-z]?)\s*[,;/|]?\s*(\d{1,3}\s*°?\s*[a-z]?)\s*$/i.exec(text);
  if (!m) return null;
  const a = degreeOf(m[1] ?? '', lang);
  const b = degreeOf(m[2] ?? '', lang);
  if (!a || !b) return null;
  // A zero takes the axis the other one leaves; two zeros are the equator on the prime meridian.
  const axisA = a.axis ?? (b.axis === 'lat' ? 'lon' : 'lat');
  const axisB = b.axis ?? (axisA === 'lat' ? 'lon' : 'lat');
  if (axisA === axisB) return null;
  const lat = axisA === 'lat' ? a.value : b.value;
  const lon = axisA === 'lon' ? a.value : b.value;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

const same = (a: GridPoint, b: GridPoint) => a.lat === b.lat && a.lon === b.lon;

/**
 * Her typed crossing against the key (as code wrote it), exactly: 'correct' where she wrote the
 * key's crossing in her language, 'incorrect' where she wrote another point. Null where she wrote
 * no coordinates — and where her language is not German but her "O" read as the German Ost would
 * be the key: a French app on a German school's sheet; which convention she followed is not
 * code's to guess. In German "O" is Ost, and "60° O" for 60° W is wrong.
 */
export function gridVerdict(
  key: string,
  text: string,
  lang: string | null,
): 'correct' | 'incorrect' | null {
  const want = gridParse(key, 'de');
  const got = gridParse(text, lang);
  if (!want || !got) return null;
  if (same(want, got)) return 'correct';
  const german = lang === 'de' ? null : gridParse(text, 'de');
  return german && same(want, german) ? null : 'incorrect';
}

/** Where crossing `index` stands in the frame, or null outside it. */
export function gridAt(v: MapView, shape: MapGridShape, index: number): At | null {
  const cell = gridCell(v, index);
  return cell ? (shape.at[cell[1]]?.[cell[0]] ?? null) : null;
}

/** The crossing nearest to (x, y) in the frame, as [meridian, parallel] — a tap never misses. */
export function gridNearest(shape: MapGridShape, x: number, y: number): [number, number] {
  let best: [number, number] = [0, 0];
  let bestD = Infinity;
  shape.at.forEach((row, j) =>
    row.forEach((p, i) => {
      const d = p ? Math.hypot(p[0] - x, p[1] - y) : Infinity;
      if (d < bestD) [best, bestD] = [[i, j], d];
    }),
  );
  return best;
}

/**
 * Whether crossing `index` of view `v`, drawn `height` high, can be asked for: it stands on the
 * map, and in the smallest room every other crossing is at least a 24 pt target away (WCAG 2.2,
 * 2.5.8) — the meridians of the world map come closer than that towards the poles.
 */
export function gridTappable(
  v: MapView,
  shape: MapGridShape,
  index: number,
  height: number,
): boolean {
  const p = gridAt(v, shape, index);
  if (!p) return false;
  const least = 2 * regionTapLeast(height, TAP_TARGET.map);
  return shape.at.every((row) =>
    row.every((q) => !q || q === p || Math.hypot(q[0] - p[0], q[1] - p[1]) >= least),
  );
}
