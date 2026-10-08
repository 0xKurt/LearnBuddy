// Maps, part 2 (#429): the capitals, rivers and mountain ranges of Germany and Europe, and the closer
// Ausschnitte of Europe code zooms into where a place is too small for a finger. Every key is the
// data's (Natural Earth); what a finger means is `regionAt`, what can be asked `regionTappable`.

import { describe, expect, it } from 'vitest';

import { MAP_SHAPES } from '../mapShapes.data.js';
import {
  EUROPE_CLOSER_VIEWS,
  mapCanonical,
  mapHeight,
  mapPlace,
  mapPlaces,
  mapProblem,
  mapRegion,
  mapRegions,
  mapTapSet,
  type MapFig,
  type MapLayer,
} from '../maps.js';
import { mapZoom } from '../mapZoom.js';
import { REGION_LANGS, regionAt, regionReach, regionTappable, TAP_TARGET } from '../regions.js';
import { tapPick, tapProblem, tapText } from '../tap.js';

const fig = (v: MapFig['v'], l: MapLayer, hl: string[] = []): MapFig => ({ type: 'map', v, l, hl });
const set = (f: MapFig) => mapTapSet(MAP_SHAPES[f.v], f)!;
/** Where a place is drawn on its map: its label (a capital's point, a river's middle). */
const at = (f: MapFig, name: string) => set(f).regions[mapPlace(f, name)!]!.at;

/** Each Land with its seat of government. */
const CAPITALS: Array<[string, string]> = [
  ['Baden-Württemberg', 'Stuttgart'],
  ['Bayern', 'München'],
  ['Berlin', 'Berlin'],
  ['Brandenburg', 'Potsdam'],
  ['Bremen', 'Bremen'],
  ['Hamburg', 'Hamburg'],
  ['Hessen', 'Wiesbaden'],
  ['Mecklenburg-Vorpommern', 'Schwerin'],
  ['Niedersachsen', 'Hannover'],
  ['Nordrhein-Westfalen', 'Düsseldorf'],
  ['Rheinland-Pfalz', 'Mainz'],
  ['Saarland', 'Saarbrücken'],
  ['Sachsen', 'Dresden'],
  ['Sachsen-Anhalt', 'Magdeburg'],
  ['Schleswig-Holstein', 'Kiel'],
  ['Thüringen', 'Erfurt'],
];

describe('the capitals (#429)', () => {
  const cities = fig('de', 'cities');

  it('has every Land’s capital, standing in its Land', () => {
    expect(mapPlaces(cities)).toHaveLength(16);
    for (const [land, city] of CAPITALS) {
      const [x, y] = at(cities, city);
      expect(regionAt(MAP_SHAPES.de, x, y, 0), city).toBe(mapRegion('de', land));
    }
  });

  it('asks a capital to be tapped only where a finger can tell it from its neighbour', () => {
    const tappable = (name: string) =>
      regionTappable(set(cities), mapPlace(cities, name)!, mapHeight('de'), TAP_TARGET.map);
    expect(tappable('Hannover')).toBe(true);
    expect(tappable('München')).toBe(true);
    // Potsdam lies a finger from Berlin, Wiesbaden from Mainz: neither can be asked by a tap.
    expect(tappable('Potsdam')).toBe(false);
    expect(tappable('Wiesbaden')).toBe(false);
  });

  it('takes a tap near a capital for that capital, and writes its German name', () => {
    const [x, y] = at(cities, 'Hannover');
    const pick = regionAt(set(cities), x + 5, y - 5, regionReach(320));
    expect(tapText(cities, [pick])).toBe('Hannover');
    expect(tapPick(cities, 'Hanover')).toEqual([pick]);
  });

  it('has the capitals of Europe’s countries', () => {
    const europe = fig('europe', 'cities');
    for (const city of ['Paris', 'Rom', 'Warschau', 'Lissabon', 'Kopenhagen', 'Luxemburg']) {
      expect(mapPlace(europe, city), city).not.toBeNull();
    }
  });
});

describe('the rivers and mountain ranges (#429)', () => {
  const rivers = fig('de', 'rivers');

  it('has the rivers a school atlas names, by any of their names', () => {
    for (const name of ['Rhein', 'Rhine', 'Donau', 'Danube', 'Elbe', 'Weser', 'Main', 'Isar']) {
      expect(mapPlace(rivers, name), name).not.toBeNull();
    }
    expect(mapCanonical(fig('de', 'rivers', ['Rhine'])).hl).toEqual(['rhein']);
  });

  it('is a line: a tap anywhere on a river is that river, never the one whose middle is near', () => {
    const shapes = set(rivers).regions;
    shapes.forEach((s, i) => {
      expect(s.line).toBe(true);
      const ring = s.rings[0]!.split(' ').map(Number);
      // The first point of the river: far from its own middle, maybe near another's.
      expect(
        regionAt(set(rivers), ring[0]!, ring[1]!, regionReach(320)),
        mapPlaces(rivers)[i]!.de,
      ).toBe(i);
    });
    // Every river of Germany can be asked for by a tap: each has a stretch no other runs beside.
    shapes.forEach((_, i) =>
      expect(regionTappable(set(rivers), i, mapHeight('de'), TAP_TARGET.map)).toBe(true),
    );
  });

  it('has the ranges, as areas', () => {
    expect(mapPlace(fig('de', 'mountains'), 'Harz')).not.toBeNull();
    const ranges = fig('europe', 'mountains');
    for (const name of ['Alpen', 'Pyrenäen', 'Karpaten', 'Apennin', 'Skanden']) {
      expect(mapPlace(ranges, name), name).not.toBeNull();
    }
  });

  it('every name, in every language, means exactly one place of its layer', () => {
    for (const v of ['de', 'europe'] as const) {
      for (const l of ['cities', 'rivers', 'mountains'] as const) {
        const f = fig(v, l);
        mapPlaces(f).forEach((p, i) => {
          for (const name of [p.id, ...REGION_LANGS.map((g) => p[g]), ...p.alt]) {
            expect(mapPlace(f, name), `${v} ${l}: ${name}`).toBe(i);
          }
        });
      }
    }
  });

  it('has no places on the map of the continents, and refuses one', () => {
    expect(mapProblem(fig('world', 'rivers'))).toMatch(/no rivers/);
    expect(mapProblem(fig('de', 'rivers', ['Wolga']))).toMatch(/no rivers "Wolga"/);
  });

  it('holds a tap to a place of the layer, not to a region', () => {
    expect(tapProblem(fig('de', 'rivers'), 'short', 'Rhein')).toBeNull();
    expect(tapProblem(fig('de', 'rivers'), 'short', 'Bayern')).toMatch(/no place/);
    expect(tapProblem(fig('de', 'rivers', ['Rhein']), 'short', 'Rhein')).toMatch(/already marks/);
  });
});

describe('zoom: the closer Ausschnitte of Europe (#429)', () => {
  const zoom = (name: string, l: MapLayer = 'regions') => {
    const f = fig('europe', l);
    return mapZoom(f, mapPlace(f, name));
  };

  it('keeps the whole map where the place is big enough, and zooms in where it is not', () => {
    expect(zoom('Frankreich')).toBe('europe');
    expect(zoom('Luxemburg')).toBe('eu_central');
    expect(zoom('Schweiz')).toBe('eu_central');
    expect(zoom('Albanien')).toBe('eu_southeast');
    expect(zoom('Estland')).toBe('eu_north');
    expect(zoom('Wien', 'cities')).toBe(null);
    expect(zoom('Prag', 'cities')).toBe('eu_central');
  });

  it('lets every country of Europe be tapped on some Ausschnitt but Kosovo', () => {
    const none = mapRegions('europe')
      .filter((_, i) =>
        ['europe', ...EUROPE_CLOSER_VIEWS].every(
          (v) =>
            !regionTappable(
              MAP_SHAPES[v as MapFig['v']],
              i,
              mapHeight(v as MapFig['v']),
              TAP_TARGET.map,
            ),
        ),
      )
      .map((r) => r.de);
    expect(none).toEqual(['Kosovo']);
  });

  it('needs every marked place on the Ausschnitt too', () => {
    // Luxembourg marked: only the closer map shows it big enough to see.
    expect(mapZoom(fig('europe', 'regions', ['Luxemburg']), null)).toBe('eu_central');
    // Portugal and Estonia marked together: no Ausschnitt shows both.
    expect(mapZoom(fig('europe', 'regions', ['Portugal', 'Estland']), null)).toBe(null);
  });
});
