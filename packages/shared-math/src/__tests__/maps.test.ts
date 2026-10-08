// Maps (issue #251): names resolved against the Natural Earth data in five languages, the data's
// own invariants, and which region a finger means.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../figureNames.data.js';
import { MAP_SHAPES } from '../mapShapes.data.js';
import {
  MAP_BASE_VIEWS,
  MAP_VIEWS,
  mapCanonical,
  mapHeight,
  mapHomeLand,
  mapProblem,
  mapRegion,
  mapPlaceName,
  mapRegions,
  type MapFig,
  type MapView,
} from '../maps.js';
import {
  REGION_LANGS,
  regionAt,
  regionPath,
  regionReach,
  regionSmall,
  regionTapWidth,
  regionTappable,
  TAP_TARGET,
} from '../regions.js';
import { tapPick, tapProblem, tapText, tapVerdict } from '../tap.js';

const id = (v: MapView, name: string) =>
  mapRegions(FIGURE_NAMES, v)[mapRegion(FIGURE_NAMES, v, name) ?? -1]?.id;

describe('the data', () => {
  it('has the 16 Länder, the countries of Europe and the seven continents', () => {
    expect(mapRegions(FIGURE_NAMES, 'de')).toHaveLength(16);
    expect(mapRegions(FIGURE_NAMES, 'world').map((r) => r.de)).toEqual([
      'Afrika',
      'Antarktis',
      'Asien',
      'Australien und Ozeanien',
      'Europa',
      'Nordamerika',
      'Südamerika',
    ]);
    expect(mapRegions(FIGURE_NAMES, 'europe').length).toBeGreaterThan(35);
  });

  it('names and shapes line up, region by region', () => {
    for (const v of MAP_VIEWS) {
      expect(MAP_SHAPES[v].regions).toHaveLength(mapRegions(FIGURE_NAMES, v).length);
    }
    // Every region of a whole map has a shape; a closer Ausschnitt of Europe (#429) leaves out
    // what lies outside its frame.
    for (const v of MAP_BASE_VIEWS) {
      for (const s of MAP_SHAPES[v].regions) expect(s.rings.length).toBeGreaterThan(0);
    }
  });

  it('every name, in every language, means exactly one region of its map', () => {
    for (const v of MAP_BASE_VIEWS) {
      mapRegions(FIGURE_NAMES, v).forEach((r, i) => {
        for (const name of [r.id, ...REGION_LANGS.map((l) => r[l]), ...r.alt]) {
          expect(mapRegion(FIGURE_NAMES, v, name), `${v}: ${name}`).toBe(i);
        }
      });
    }
  });
});

describe('a name resolved against the data', () => {
  it('in German, English and the other languages, by id, without case or dash', () => {
    expect(id('de', 'Bayern')).toBe('BY');
    expect(id('de', 'Bavaria')).toBe('BY');
    expect(id('de', 'Bavière')).toBe('BY');
    expect(id('de', 'nordrhein westfalen')).toBe('NW');
    expect(id('de', 'North Rhine-Westphalia')).toBe('NW');
    expect(id('de', 'Freie Hansestadt Bremen')).toBe('HB');
    expect(id('europe', 'Frankreich')).toBe('FR');
    expect(id('europe', 'France')).toBe('FR');
    expect(id('europe', 'fr')).toBe('FR');
    expect(id('world', 'Australien')).toBe('OC');
    expect(id('world', 'South America')).toBe('SA');
  });

  it('a name no region of THIS map has is none', () => {
    expect(mapRegion(FIGURE_NAMES, 'de', 'München')).toBeNull();
    expect(mapRegion(FIGURE_NAMES, 'europe', 'Bayern')).toBeNull();
    expect(mapRegion(FIGURE_NAMES, 'world', 'Frankreich')).toBeNull();
    expect(mapRegion(FIGURE_NAMES, 'de', '  ')).toBeNull();
  });

  it('a region is named in the app’s language, in German otherwise', () => {
    const by = mapRegion(FIGURE_NAMES, 'de', 'Bayern') ?? -1;
    expect(mapPlaceName(FIGURE_NAMES, { v: 'de' }, by, 'en')).toBe('Bavaria');
    expect(mapPlaceName(FIGURE_NAMES, { v: 'de' }, by, 'it')).toBe('Baviera');
    expect(mapPlaceName(FIGURE_NAMES, { v: 'de' }, by, 'nl')).toBe('Bayern');
  });

  it('a map marks only regions it has, each once, stored by id', () => {
    expect(mapProblem(FIGURE_NAMES, { type: 'map', v: 'europe', hl: ['Bayern'] })).toMatch(
      /no region/,
    );
    expect(mapProblem(FIGURE_NAMES, { type: 'map', v: 'de', hl: ['Bayern', 'Bavaria'] })).toMatch(
      /twice/,
    );
    expect(mapProblem(FIGURE_NAMES, { type: 'map', v: 'de', hl: ['Bayern', 'Hessen'] })).toBeNull();
    expect(
      mapCanonical(FIGURE_NAMES, { type: 'map', v: 'europe', hl: ['France', 'Spanien'] }).hl,
    ).toEqual(['FR', 'ES']);
  });
});

describe('a map is tapped like every figure (`tap.ts`)', () => {
  const de = { type: 'map', v: 'de', hl: [] } as const;

  it('a tap writes the region’s German name, and reads any of its names back', () => {
    const pick = tapPick(FIGURE_NAMES, de, 'Bavaria');
    expect(pick).not.toBeNull();
    expect(tapText(FIGURE_NAMES, de, pick!)).toBe('Bayern');
    expect(tapVerdict(FIGURE_NAMES, de, 'Bayern', 'Bavaria')).toBe('correct');
    expect(tapVerdict(FIGURE_NAMES, de, 'Bayern', 'Hessen')).toBe('incorrect');
    expect(tapVerdict(FIGURE_NAMES, de, 'Bayern', 'Bayer')).toBeNull();
  });

  it('a key on no region, or one the map marks, cannot be tapped', () => {
    expect(tapProblem(FIGURE_NAMES, de, 'short', 'Bayern')).toBeNull();
    expect(tapProblem(FIGURE_NAMES, de, 'short', 'München')).toMatch(/no place/);
    const marked: MapFig = { ...de, hl: ['BY'] };
    expect(tapProblem(FIGURE_NAMES, marked, 'short', 'Bayern')).toMatch(/already marks/);
    expect(tapProblem(FIGURE_NAMES, de, 'numeric', 'Bayern')).toMatch(/short/);
  });
});

describe('which region a finger means', () => {
  const view = MAP_SHAPES.de;
  const at = (name: string) => view.regions[mapRegion(FIGURE_NAMES, 'de', name) ?? -1]!.at;
  // Half a 44 pt target on the narrowest map, in the frame's units.
  const reach = regionReach(regionTapWidth(mapHeight('de')));

  it('every Land at its label, also the city states smaller than a finger', () => {
    mapRegions(FIGURE_NAMES, 'de').forEach((r, i) => {
      const [x, y] = view.regions[i]!.at;
      expect(regionAt(view, x, y, reach), r.de).toBe(i);
    });
    expect(regionSmall(view.regions[mapRegion(FIGURE_NAMES, 'de', 'Bremen')!]!, reach)).toBe(true);
    expect(regionSmall(view.regions[mapRegion(FIGURE_NAMES, 'de', 'Bayern')!]!, reach)).toBe(false);
  });

  it('near Berlin is Berlin; farther out, the Brandenburg around it', () => {
    const [bx, by] = at('Berlin');
    // Without any finger: Berlin is a hole in Brandenburg, not covered by it (nonzero winding).
    expect(regionAt(view, bx, by, 0)).toBe(mapRegion(FIGURE_NAMES, 'de', 'Berlin'));
    // 12 pt from its label: a 24 pt target, though Berlin is narrower than that.
    expect(regionAt(view, bx + reach * 0.5, by, reach)).toBe(
      mapRegion(FIGURE_NAMES, 'de', 'Berlin'),
    );
    expect(regionAt(view, bx + reach * 2.5, by, reach)).toBe(
      mapRegion(FIGURE_NAMES, 'de', 'Brandenburg'),
    );
  });

  it('a tap off the land snaps to the nearest region — a tap never misses', () => {
    // Far west of the Saarland and Rhineland-Palatinate, outside Germany.
    const [sx, sy] = at('Saarland');
    expect(regionAt(view, sx - 200, sy, reach)).toBe(mapRegion(FIGURE_NAMES, 'de', 'Saarland'));
  });

  it('every continent at its label on the world map', () => {
    MAP_SHAPES.world.regions.forEach((s, i) => {
      expect(regionAt(MAP_SHAPES.world, s.at[0], s.at[1], 10)).toBe(i);
    });
  });

  it('every Land and every continent can be asked for by a tap; Luxembourg on Europe cannot', () => {
    for (const v of ['de', 'world'] as const) {
      mapRegions(FIGURE_NAMES, v).forEach((r, i) =>
        expect(regionTappable(MAP_SHAPES[v], i, mapHeight(v), TAP_TARGET.map), r.de).toBe(true),
      );
    }
    const europe = MAP_SHAPES.europe;
    const h = mapHeight('europe');
    expect(
      regionTappable(europe, mapRegion(FIGURE_NAMES, 'europe', 'Frankreich')!, h, TAP_TARGET.map),
    ).toBe(true);
    expect(
      regionTappable(europe, mapRegion(FIGURE_NAMES, 'europe', 'Luxemburg')!, h, TAP_TARGET.map),
    ).toBe(false);
    // Germany is drawn narrower than it is wide a room: tall, it must fit 330 pt.
    expect(Math.round(regionTapWidth(mapHeight('de')))).toBe(244);
  });

  it('a path is the rings at the drawn size', () => {
    expect(regionPath(['0 0 10 0 10 10'], 2)).toBe('M0 0L20 0L20 20Z');
  });
});

describe('her Land on the map of Germany (#429)', () => {
  // The profile's codes (`CurriculumRegion`, shared-types): each of the 16 is a Land of the map.
  const LAENDER = [
    'bw',
    'by',
    'be',
    'bb',
    'hb',
    'hh',
    'he',
    'mv',
    'ni',
    'nw',
    'rp',
    'sl',
    'sn',
    'st',
    'sh',
    'th',
  ];

  it('every Land code of the profile is one region of the map, by id', () => {
    const ids = LAENDER.map((r) => mapHomeLand(FIGURE_NAMES, r));
    expect(ids).toEqual(LAENDER.map((r) => r.toUpperCase()));
    expect(new Set(ids.map((id) => mapRegion(FIGURE_NAMES, 'de', id!)))).toHaveProperty('size', 16);
  });

  it('no Land, "other" or a value no Land has: none, never a guess', () => {
    expect(mapHomeLand(FIGURE_NAMES, null)).toBeNull();
    expect(mapHomeLand(FIGURE_NAMES, 'other')).toBeNull();
    expect(mapHomeLand(FIGURE_NAMES, 'xx')).toBeNull();
    // A name is no code: the profile holds codes only.
    expect(mapHomeLand(FIGURE_NAMES, 'Bayern')).toBeNull();
  });
});
