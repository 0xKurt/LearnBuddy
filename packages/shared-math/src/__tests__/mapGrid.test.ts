// Maps, part 2 (#429): the Gradnetz. Its crossings are the places of a question on it — written
// "50° N, 10° O" by code and read back one way in all five languages, typed by her in hers — and
// they stand where the map's own projection puts them: a capital lies between the right lines.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../figureNames.data.js';
import {
  gridAt,
  gridCrossing,
  gridIndex,
  gridParse,
  gridTappable,
  gridText,
  gridVerdict,
  mapGrid,
  type GridPoint,
} from '../mapGrid.js';
import { MAP_SHAPES } from '../mapShapes.data.js';
import {
  EUROPE_CLOSER_VIEWS,
  MAP_BASE_VIEWS,
  mapCanonical,
  mapHeight,
  mapPlace,
  mapProblem,
  mapRegion,
  type MapFig,
  type MapView,
} from '../maps.js';
import { mapZoom } from '../mapZoom.js';
import { REGION_LANGS, regionAt } from '../regions.js';
import { tapAxes, tapPick, tapProblem, tapText, tapVerdict } from '../tap.js';

const grid = (v: MapView, hl: string[] = []): MapFig => ({ type: 'map', v, l: 'grid', hl });
/** Where the crossing at `p` stands on view `v`. */
const where = (v: MapView, p: GridPoint) => {
  const at = gridAt(v, MAP_SHAPES[v].grid!, gridIndex(v, p)!);
  if (!at) throw new Error(`${gridText(p, 'de')} is not on ${v}`);
  return at;
};
/** Every crossing of view `v`, by its index. */
const crossings = (v: MapView) => {
  const g = mapGrid(v)!;
  return Array.from({ length: g.lon.length * g.lat.length }, (_, i) => i);
};

describe('a crossing in words', () => {
  it('is written latitude first, east as each language writes it, west W in all five', () => {
    expect(gridText({ lat: 50, lon: 10 }, 'de')).toBe('50° N, 10° O');
    expect(gridText({ lat: 50, lon: 10 }, 'en')).toBe('50° N, 10° E');
    expect(gridText({ lat: 50, lon: 10 }, 'fr')).toBe('50° N, 10° E');
    expect(gridText({ lat: -30, lon: -60 }, 'de')).toBe('30° S, 60° W');
    expect(gridText({ lat: -30, lon: -60 }, 'es')).toBe('30° S, 60° W');
    expect(gridText({ lat: 0, lon: 30 }, 'it')).toBe('0°, 30° E');
    expect(gridText({ lat: 0, lon: 0 }, 'de')).toBe('0°, 0°');
  });

  it('reads back one way, whatever language code wrote it in — and in that language', () => {
    for (const v of MAP_BASE_VIEWS) {
      for (const c of crossings(v)) {
        const p = gridCrossing(v, c)!;
        for (const lang of REGION_LANGS) {
          expect(gridParse(gridText(p, lang), 'de'), `${v} ${lang}`).toEqual(p);
          expect(gridParse(gridText(p, lang), lang), `${v} ${lang}`).toEqual(p);
        }
      }
    }
  });

  it('reads her notation: no spaces, either order, a zero without a letter', () => {
    expect(gridParse('50°N 10°O', 'de')).toEqual({ lat: 50, lon: 10 });
    expect(gridParse('10° O / 50° N', 'de')).toEqual({ lat: 50, lon: 10 });
    expect(gridParse(' 50 n; 10 e ', 'en')).toEqual({ lat: 50, lon: 10 });
    expect(gridParse('0°, 20° W', 'de')).toEqual({ lat: 0, lon: -20 });
    expect(gridParse('20° W, 0°', 'en')).toEqual({ lat: 0, lon: -20 });
    expect(gridParse('0°, 0°', 'fr')).toEqual({ lat: 0, lon: 0 });
  });

  it('reads O as her language means it: east in German, west in French, Spanish, Italian', () => {
    expect(gridParse('50° N, 20° O', 'de')).toEqual({ lat: 50, lon: 20 });
    expect(gridParse('50° N, 20° O', 'fr')).toEqual({ lat: 50, lon: -20 });
    expect(gridParse('50° N, 20° O', 'es')).toEqual({ lat: 50, lon: -20 });
    expect(gridParse('50° N, 20° O', 'it')).toEqual({ lat: 50, lon: -20 });
    // English has no O; and without a language O means nothing.
    expect(gridParse('50° N, 20° O', 'en')).toBeNull();
    expect(gridParse('50° N, 20° O', null)).toBeNull();
  });

  it('is no crossing where it is words, a bare number, two latitudes or off the globe', () => {
    for (const text of [
      '50° nördliche Breite, 10° östliche Länge',
      '50, 10',
      '50° N',
      '50° N, 40° S',
      '95° N, 10° O',
      '50° N, 190° W',
      '50,5° N, 10° O',
      'Berlin',
    ]) {
      expect(gridParse(text, 'de'), text).toBeNull();
    }
  });
});

describe('her typed crossing, judged exactly (#429)', () => {
  it('is right in her letters, wrong elsewhere', () => {
    expect(gridVerdict('50° N, 10° O', '50 N 10 O', 'de')).toBe('correct');
    expect(gridVerdict('50° N, 10° O', '50° N, 10° E', 'fr')).toBe('correct');
    expect(gridVerdict('50° N, 20° W', '50° N, 20° O', 'fr')).toBe('correct');
    expect(gridVerdict('50° N, 10° O', '40° N, 10° O', 'de')).toBe('incorrect');
    expect(gridVerdict('50° N, 20° W', '50° N, 20° E', 'en')).toBe('incorrect');
  });

  it('leaves an O that is the key only as the German Ost to the tutor, outside German', () => {
    // A German sheet in a French app: whose "O" she meant is not code's to guess.
    expect(gridVerdict('50° N, 10° O', '50° N, 10° O', 'fr')).toBeNull();
    // In German O is Ost: 20° O for 20° W is wrong.
    expect(gridVerdict('50° N, 20° W', '50° N, 20° O', 'de')).toBe('incorrect');
    // No coordinates at all: the other rules judge it.
    expect(gridVerdict('50° N, 10° O', 'bei Fulda', 'de')).toBeNull();
  });
});

describe('the Gradnetz on the map (#429)', () => {
  it('runs every degree over Germany, every ten over Europe, every thirty over the world', () => {
    expect(mapGrid('de')).toEqual({
      lon: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      lat: [48, 49, 50, 51, 52, 53, 54, 55],
    });
    expect(mapGrid('europe')?.lat).toEqual([40, 50, 60, 70]);
    expect(mapGrid('world')).toEqual({
      lon: [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150],
      lat: [-60, -30, 0, 30, 60],
    });
    // A closer Ausschnitt of Europe has no Gradnetz.
    for (const v of EUROPE_CLOSER_VIEWS) expect(mapGrid(v)).toBeNull();
  });

  it('stands where the map’s own projection puts it: each capital between its lines', () => {
    // Where the capitals lie (rounded): far enough from a line to tell.
    const capitals: Array<[string, number, number]> = [
      ['Berlin', 52.52, 13.4],
      ['München', 48.14, 11.58],
      ['Stuttgart', 48.78, 9.18],
      ['Hannover', 52.37, 9.73],
      ['Kiel', 54.32, 10.13],
      ['Schwerin', 53.63, 11.41],
    ];
    const cities = MAP_SHAPES.de.places!.cities;
    for (const [name, lat, lon] of capitals) {
      const [x, y] = cities[mapPlace(FIGURE_NAMES, { v: 'de', l: 'cities' }, name)!]!.at;
      const sw = where('de', { lat: Math.floor(lat), lon: Math.floor(lon) });
      const ne = where('de', { lat: Math.ceil(lat), lon: Math.ceil(lon) });
      expect(x, name).toBeGreaterThan(sw[0]);
      expect(x, name).toBeLessThan(ne[0]);
      expect(y, name).toBeLessThan(sw[1]);
      expect(y, name).toBeGreaterThan(ne[1]);
    }
  });

  it('crosses in the land the atlas shows there', () => {
    const lands: Array<[MapView, GridPoint, string]> = [
      ['de', { lat: 50, lon: 10 }, 'Bayern'],
      ['de', { lat: 52, lon: 13 }, 'Brandenburg'],
      ['de', { lat: 54, lon: 10 }, 'Schleswig-Holstein'],
      ['de', { lat: 51, lon: 7 }, 'Nordrhein-Westfalen'],
      ['de', { lat: 48, lon: 8 }, 'Baden-Württemberg'],
      ['europe', { lat: 50, lon: 10 }, 'Deutschland'],
      ['europe', { lat: 60, lon: 10 }, 'Norwegen'],
      ['europe', { lat: 50, lon: 20 }, 'Polen'],
      ['europe', { lat: 50, lon: 30 }, 'Ukraine'],
      ['world', { lat: 0, lon: 30 }, 'Afrika'],
      ['world', { lat: 30, lon: 0 }, 'Afrika'],
      ['world', { lat: -30, lon: -60 }, 'Südamerika'],
      ['world', { lat: 30, lon: 90 }, 'Asien'],
      ['world', { lat: -30, lon: 120 }, 'Ozeanien'],
      ['world', { lat: 60, lon: -120 }, 'Nordamerika'],
    ];
    for (const [v, p, land] of lands) {
      const [x, y] = where(v, p);
      expect(regionAt(MAP_SHAPES[v], x, y, 0), `${v} ${gridText(p, 'de')}`).toBe(
        mapRegion(FIGURE_NAMES, v, land),
      );
    }
  });

  it('can be tapped at every crossing on the map, but not where the world’s meridians close in', () => {
    const tappable = (v: MapView) =>
      crossings(v).filter((c) => gridTappable(v, MAP_SHAPES[v].grid!, c, mapHeight(v)));
    expect(tappable('de')).toHaveLength(80);
    // Europe: only the crossings inside its frame, at 70° N still 30 pt apart.
    const europe = tappable('europe').map((c) => gridText(gridCrossing('europe', c)!, 'de'));
    expect(europe).toContain('70° N, 30° O');
    expect(europe).toContain('40° N, 0°');
    expect(europe).not.toContain('40° N, 40° O');
    expect(europe).toHaveLength(
      crossings('europe').filter((c) => gridAt('europe', MAP_SHAPES.europe.grid!, c)).length,
    );
    // The world: 60° N and S come closer than a finger; the rest can be tapped.
    const world = tappable('world').map((c) => gridCrossing('world', c)!.lat);
    expect(world).toHaveLength(33);
    expect(world).not.toContain(60);
    expect(world).not.toContain(-60);
  });
});

describe('a question on the Gradnetz (#429)', () => {
  it('is tapped on two axes, meridians and parallels, written as the key', () => {
    const f = grid('de');
    expect(tapAxes(FIGURE_NAMES, f)?.map((a) => a.name)).toEqual(['lon', 'lat']);
    expect(tapText(FIGURE_NAMES, f, [4, 2])).toBe('50° N, 10° O');
    for (const c of crossings('de')) {
      expect(mapPlace(FIGURE_NAMES, f, gridText(gridCrossing('de', c)!, 'de'))).toBe(c);
    }
    expect(tapPick(FIGURE_NAMES, f, '50° N, 10° O')).toEqual([4, 2]);
    expect(tapPick(FIGURE_NAMES, f, '50° N, 10° E')).toEqual([4, 2]);
    expect(tapPick(FIGURE_NAMES, f, '50° N, 16° O')).toBeNull();
    expect(tapVerdict(FIGURE_NAMES, f, '50° N, 10° O', '50° N, 10° O')).toBe('correct');
    expect(tapVerdict(FIGURE_NAMES, f, '50° N, 10° O', '51° N, 10° O')).toBe('incorrect');
  });

  it('marks a crossing, stored as German writes it', () => {
    const f = grid('europe', ['50° N, 10° E']);
    expect(mapProblem(FIGURE_NAMES, f)).toBeNull();
    expect(mapCanonical(FIGURE_NAMES, f).hl).toEqual(['50° N, 10° O']);
    expect(tapProblem(FIGURE_NAMES, f, 'short', '50° N, 10° O')).toBe(
      'the figure already marks the key',
    );
    expect(tapProblem(FIGURE_NAMES, f, 'short', '60° N, 10° O')).toBeNull();
  });

  it('is no question where no two lines cross, or on a map without a grid', () => {
    expect(mapProblem(FIGURE_NAMES, grid('europe', ['55° N, 10° O']))).toBe(
      'no grid "55° N, 10° O" on the map europe',
    );
    expect(mapProblem(FIGURE_NAMES, grid('de', ['50° N, 10° O', '50° N, 10° E']))).toBe(
      'a place is marked twice',
    );
    expect(mapProblem(FIGURE_NAMES, grid('eu_central'))).toBe('the map eu_central has no grid');
  });

  it('stays on its map: never zoomed, dropped where the crossings close in', () => {
    const f = grid('europe');
    expect(mapZoom(FIGURE_NAMES, f, mapPlace(FIGURE_NAMES, f, '50° N, 10° O'))).toBe('europe');
    const w = grid('world');
    expect(mapZoom(FIGURE_NAMES, w, mapPlace(FIGURE_NAMES, w, '30° S, 60° W'))).toBe('world');
    expect(mapZoom(FIGURE_NAMES, w, mapPlace(FIGURE_NAMES, w, '60° N, 90° O'))).toBeNull();
  });
});
