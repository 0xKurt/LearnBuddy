// Maps (issue #251): names resolved against the Natural Earth data in five languages, the data's
// own invariants, and which region a finger means.

import { describe, expect, it } from 'vitest';

import { MAP_SHAPES } from '../mapShapes.data.js';
import {
  MAP_VIEWS,
  mapCanonical,
  mapHeight,
  mapProblem,
  mapRegion,
  mapRegionName,
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

const id = (v: MapView, name: string) => mapRegions(v)[mapRegion(v, name) ?? -1]?.id;

describe('the data', () => {
  it('has the 16 Länder, the countries of Europe and the seven continents', () => {
    expect(mapRegions('de')).toHaveLength(16);
    expect(mapRegions('world').map((r) => r.de)).toEqual([
      'Afrika',
      'Antarktis',
      'Asien',
      'Australien und Ozeanien',
      'Europa',
      'Nordamerika',
      'Südamerika',
    ]);
    expect(mapRegions('europe').length).toBeGreaterThan(35);
  });

  it('names and shapes line up, region by region', () => {
    for (const v of MAP_VIEWS) {
      expect(MAP_SHAPES[v].regions).toHaveLength(mapRegions(v).length);
      for (const s of MAP_SHAPES[v].regions) expect(s.rings.length).toBeGreaterThan(0);
    }
  });

  it('every name, in every language, means exactly one region of its map', () => {
    for (const v of MAP_VIEWS) {
      mapRegions(v).forEach((r, i) => {
        for (const name of [r.id, ...REGION_LANGS.map((l) => r[l]), ...r.alt]) {
          expect(mapRegion(v, name), `${v}: ${name}`).toBe(i);
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
    expect(mapRegion('de', 'München')).toBeNull();
    expect(mapRegion('europe', 'Bayern')).toBeNull();
    expect(mapRegion('world', 'Frankreich')).toBeNull();
    expect(mapRegion('de', '  ')).toBeNull();
  });

  it('a region is named in the app’s language, in German otherwise', () => {
    const by = mapRegion('de', 'Bayern') ?? -1;
    expect(mapRegionName('de', by, 'en')).toBe('Bavaria');
    expect(mapRegionName('de', by, 'it')).toBe('Baviera');
    expect(mapRegionName('de', by, 'nl')).toBe('Bayern');
  });

  it('a map marks only regions it has, each once, stored by id', () => {
    expect(mapProblem({ type: 'map', v: 'europe', hl: ['Bayern'] })).toMatch(/no region/);
    expect(mapProblem({ type: 'map', v: 'de', hl: ['Bayern', 'Bavaria'] })).toMatch(/twice/);
    expect(mapProblem({ type: 'map', v: 'de', hl: ['Bayern', 'Hessen'] })).toBeNull();
    expect(mapCanonical({ type: 'map', v: 'europe', hl: ['France', 'Spanien'] }).hl).toEqual([
      'FR',
      'ES',
    ]);
  });
});

describe('a map is tapped like every figure (`tap.ts`)', () => {
  const de = { type: 'map', v: 'de', hl: [] } as const;

  it('a tap writes the region’s German name, and reads any of its names back', () => {
    const pick = tapPick(de, 'Bavaria');
    expect(pick).not.toBeNull();
    expect(tapText(de, pick!)).toBe('Bayern');
    expect(tapVerdict(de, 'Bayern', 'Bavaria')).toBe('correct');
    expect(tapVerdict(de, 'Bayern', 'Hessen')).toBe('incorrect');
    expect(tapVerdict(de, 'Bayern', 'Bayer')).toBeNull();
  });

  it('a key on no region, or one the map marks, cannot be tapped', () => {
    expect(tapProblem(de, 'short', 'Bayern')).toBeNull();
    expect(tapProblem(de, 'short', 'München')).toMatch(/no place/);
    const marked: MapFig = { ...de, hl: ['BY'] };
    expect(tapProblem(marked, 'short', 'Bayern')).toMatch(/already marks/);
    expect(tapProblem(de, 'numeric', 'Bayern')).toMatch(/short/);
  });
});

describe('which region a finger means', () => {
  const view = MAP_SHAPES.de;
  const at = (name: string) => view.regions[mapRegion('de', name) ?? -1]!.at;
  // Half a 44 pt target on the narrowest map, in the frame's units.
  const reach = regionReach(regionTapWidth(mapHeight('de')));

  it('every Land at its label, also the city states smaller than a finger', () => {
    mapRegions('de').forEach((r, i) => {
      const [x, y] = view.regions[i]!.at;
      expect(regionAt(view, x, y, reach), r.de).toBe(i);
    });
    expect(regionSmall(view.regions[mapRegion('de', 'Bremen')!]!, reach)).toBe(true);
    expect(regionSmall(view.regions[mapRegion('de', 'Bayern')!]!, reach)).toBe(false);
  });

  it('near Berlin is Berlin; farther out, the Brandenburg around it', () => {
    const [bx, by] = at('Berlin');
    // Without any finger: Berlin is a hole in Brandenburg, not covered by it (nonzero winding).
    expect(regionAt(view, bx, by, 0)).toBe(mapRegion('de', 'Berlin'));
    // 12 pt from its label: a 24 pt target, though Berlin is narrower than that.
    expect(regionAt(view, bx + reach * 0.5, by, reach)).toBe(mapRegion('de', 'Berlin'));
    expect(regionAt(view, bx + reach * 2.5, by, reach)).toBe(mapRegion('de', 'Brandenburg'));
  });

  it('a tap off the land snaps to the nearest region — a tap never misses', () => {
    // Far west of the Saarland and Rhineland-Palatinate, outside Germany.
    const [sx, sy] = at('Saarland');
    expect(regionAt(view, sx - 200, sy, reach)).toBe(mapRegion('de', 'Saarland'));
  });

  it('every continent at its label on the world map', () => {
    MAP_SHAPES.world.regions.forEach((s, i) => {
      expect(regionAt(MAP_SHAPES.world, s.at[0], s.at[1], 10)).toBe(i);
    });
  });

  it('every Land and every continent can be asked for by a tap; Luxembourg on Europe cannot', () => {
    for (const v of ['de', 'world'] as const) {
      mapRegions(v).forEach((r, i) =>
        expect(regionTappable(MAP_SHAPES[v], i, mapHeight(v), TAP_TARGET.map), r.de).toBe(true),
      );
    }
    const europe = MAP_SHAPES.europe;
    const h = mapHeight('europe');
    expect(regionTappable(europe, mapRegion('europe', 'Frankreich')!, h, TAP_TARGET.map)).toBe(
      true,
    );
    expect(regionTappable(europe, mapRegion('europe', 'Luxemburg')!, h, TAP_TARGET.map)).toBe(
      false,
    );
    // Germany is drawn narrower than it is wide a room: tall, it must fit 330 pt.
    expect(Math.round(regionTapWidth(mapHeight('de')))).toBe(244);
  });

  it('a path is the rings at the drawn size', () => {
    expect(regionPath(['0 0 10 0 10 10'], 2)).toBe('M0 0L20 0L20 20Z');
  });
});
