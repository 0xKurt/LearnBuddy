import { describe, expect, it } from 'vitest';

import {
  compass,
  editDistance,
  fitScale,
  graticule,
  isSmall,
  isTappable,
  judgeMapName,
  MAP_AREAS,
  MAP_MIN_BOX,
  MAP_TOUCH,
  MAP_ZOOM,
  mapArea,
  mapFeature,
  mapFeatures,
  mapLayers,
  mapName,
  mapTap,
  nameKey,
  pathRings,
  resolveMapName,
  toDegrees,
  toUnits,
  zoomScale,
  zoomWindow,
} from '../index.js';

const feature = (area: 'world' | 'europe' | 'germany', layer: 'areas' | 'cities', id: string) => {
  const f = mapFeature(area, layer, id);
  if (!f) throw new Error(`${id} missing`);
  return f;
};

describe('data', () => {
  it('has the 16 Länder with their ISO codes and a capital each', () => {
    const lands = mapFeatures('germany', 'areas');
    expect(lands.map((f) => f.id).sort()).toEqual(
      [
        'DE-BB',
        'DE-BE',
        'DE-BW',
        'DE-BY',
        'DE-HB',
        'DE-HE',
        'DE-HH',
        'DE-MV',
        'DE-NI',
        'DE-NW',
        'DE-RP',
        'DE-SH',
        'DE-SL',
        'DE-SN',
        'DE-ST',
        'DE-TH',
      ].sort(),
    );
    for (const f of lands) expect(f.capital, f.id).not.toBeNull();
    expect(
      mapName(feature('germany', 'cities', feature('germany', 'areas', 'DE-BY').capital!), 'de'),
    ).toBe('München');
  });

  it('knows which Länder border each other — from shared borders in the data', () => {
    expect(feature('germany', 'areas', 'DE-BE').neighbours).toEqual(['DE-BB']);
    expect(feature('germany', 'areas', 'DE-BY').neighbours).toEqual(
      expect.arrayContaining(['DE-BW', 'DE-HE', 'DE-TH', 'DE-SN']),
    );
    expect(feature('germany', 'areas', 'DE-BY').neighbours).not.toContain('DE-NI');
  });

  it('has no id twice in any layer', () => {
    for (const area of MAP_AREAS)
      for (const layer of mapLayers(area)) {
        const ids = mapFeatures(area, layer).map((f) => f.id);
        expect(new Set(ids).size, `${area}/${layer}`).toBe(ids.length);
      }
  });

  it('every path parses into rings inside a margin round the drawing', () => {
    for (const area of MAP_AREAS) {
      const a = mapArea(area);
      for (const f of mapFeatures(area, 'areas')) {
        const rings = pathRings(f.d);
        expect(rings.length, f.id).toBeGreaterThan(0);
        for (const r of rings)
          for (const p of r) {
            expect(p.x).toBeGreaterThanOrEqual(-41);
            expect(p.y).toBeGreaterThanOrEqual(-41);
            expect(p.x).toBeLessThanOrEqual(a.width + 41);
            expect(p.y).toBeLessThanOrEqual(a.height + 41);
          }
      }
    }
  });
});

describe('names (Regel 0: the model names, code resolves)', () => {
  it('resolves German and English names to one feature', () => {
    expect(resolveMapName('germany', 'areas', 'Bayern')).toMatchObject({ id: 'DE-BY' });
    expect(resolveMapName('germany', 'areas', 'Bavaria')).toMatchObject({ id: 'DE-BY' });
    expect(resolveMapName('germany', 'areas', 'baden-wuerttemberg')).toMatchObject({
      id: 'DE-BW',
    });
    expect(resolveMapName('europe', 'areas', 'Italien')).toMatchObject({ id: 'ITA' });
    expect(resolveMapName('europe', 'areas', 'Italy')).toMatchObject({ id: 'ITA' });
    expect(resolveMapName('world', 'areas', 'Vereinigte Staaten')).toMatchObject({ id: 'USA' });
    expect(resolveMapName('germany', 'rivers', 'Rhine')).toMatchObject({ id: 'r-rhein' });
    expect(resolveMapName('world', 'zones', 'Tropen')).toMatchObject({ id: 'z-tropics' });
  });

  it('gives no feature for a name that is not on the map, and none for a name of two', () => {
    expect(resolveMapName('germany', 'areas', 'Atlantis')).toBe('none');
    expect(resolveMapName('germany', 'areas', 'Italien')).toBe('none');
    expect(resolveMapName('europe', 'zones', 'Tropen')).toBe('none');
  });

  it('sets case, accents, ß and hyphens aside', () => {
    expect(nameKey('Baden-Württemberg')).toBe(nameKey('baden wurttemberg'));
    expect(nameKey('Thüringen')).toBe('thuringen');
    expect(nameKey('Großbritannien')).toBe(nameKey('grossbritannien'));
  });

  it('judges a typed name: right, a slip, another feature, wrong', () => {
    const by = feature('germany', 'areas', 'DE-BY');
    expect(judgeMapName('germany', by, 'Bayern').verdict).toBe('right');
    expect(judgeMapName('germany', by, 'bavaria').verdict).toBe('right');
    expect(judgeMapName('germany', by, 'Baiern').verdict).toBe('slip');
    expect(judgeMapName('germany', by, 'Hessen')).toEqual({ verdict: 'other', id: 'DE-HE' });
    expect(judgeMapName('germany', by, 'Bergland').verdict).toBe('wrong');
    // Another country's name is never a slip of this one.
    const irl = feature('europe', 'areas', 'IRL');
    expect(judgeMapName('europe', irl, 'Island')).toEqual({ verdict: 'other', id: 'ISL' });
  });

  it('allows no slip on a short name', () => {
    expect(editDistance('inn', 'ina')).toBe(1);
    const inn = mapFeature('germany', 'rivers', 'r-inn')!;
    expect(judgeMapName('germany', inn, 'Ina').verdict).toBe('wrong');
  });
});

describe('graticule', () => {
  it('reads a city off the projection: units and degrees are one map', () => {
    const a = mapArea('germany');
    const berlin = feature('germany', 'cities', 'c-berlin');
    const back = toDegrees(a, berlin.anchor[0], berlin.anchor[1]);
    expect(back.lat).toBeCloseTo(52.52, 1);
    expect(back.lon).toBeCloseTo(13.4, 1);
    const [x, y] = toUnits(a, 52, 13);
    expect(toDegrees(a, x, y).lat).toBeCloseTo(52, 9);
    expect(toDegrees(a, x, y).lon).toBeCloseTo(13, 9);
  });

  it('draws a line every degree on Germany, every 15 on the world', () => {
    const g = graticule('germany');
    expect(g.lats.map((l) => l.deg)).toEqual([48, 49, 50, 51, 52, 53, 54, 55]);
    expect(g.lons.map((l) => l.deg)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const w = graticule('world');
    expect(w.lats).toHaveLength(13);
    expect(w.lons).toHaveLength(25);
  });
});

describe('targets (a finger, 44 pt, on the smallest phone)', () => {
  it('lets every one of the 16 Länder be tapped (Berlin, Bremen, Hamburg after a zoom)', () => {
    for (const f of mapFeatures('germany', 'areas'))
      expect(isTappable('germany', 'areas', f.id), f.id).toBe(true);
  });

  it('chooses a large Land on the first tap, magnifies near a small one', () => {
    const fit = fitScale('germany', MAP_MIN_BOX);
    const zoomTo = zoomScale('germany', MAP_MIN_BOX);
    const by = feature('germany', 'areas', 'DE-BY');
    const at = { x: by.anchor[0], y: by.anchor[1] };
    expect(mapTap('germany', 'areas', fit, at, false, zoomTo)).toEqual({
      kind: 'feature',
      id: 'DE-BY',
    });
    const be = feature('germany', 'areas', 'DE-BE');
    expect(isSmall(be, fit)).toBe(true);
    const near = { x: be.anchor[0], y: be.anchor[1] };
    expect(mapTap('germany', 'areas', fit, near, false, zoomTo)).toEqual({ kind: 'zoom' });
    // Magnified: Berlin is chosen, and Brandenburg a finger's width away.
    expect(mapTap('germany', 'areas', zoomTo, near, true, zoomTo)).toEqual({
      kind: 'feature',
      id: 'DE-BE',
    });
    const bb = { x: near.x + (2 * MAP_TOUCH) / zoomTo, y: near.y };
    expect(mapTap('germany', 'areas', zoomTo, bb, true, zoomTo)).toEqual({
      kind: 'feature',
      id: 'DE-BB',
    });
  });

  it('every tappable small target owns a 44 pt disc when magnified', () => {
    for (const area of MAP_AREAS)
      for (const layer of mapLayers(area)) {
        const s = fitScale(area, MAP_MIN_BOX) * MAP_ZOOM[area];
        const fs = mapFeatures(area, layer);
        for (const f of fs) {
          if (!isTappable(area, layer, f.id) || !isSmall(f, s)) continue;
          // The disc round its anchor chooses it, from its middle to its edge.
          for (const dx of [0, MAP_TOUCH / 2 - 1])
            expect(
              mapTap(area, layer, s, { x: f.anchor[0] + dx / s, y: f.anchor[1] }, true, s),
              `${area}/${layer}/${f.id}`,
            ).toEqual({ kind: 'feature', id: f.id });
        }
      }
  });

  it('refuses a key two capitals share a finger with (Mainz and Wiesbaden)', () => {
    expect(isTappable('germany', 'cities', 'c-mainz')).toBe(false);
    expect(isTappable('germany', 'cities', 'c-berlin')).toBe(true);
  });

  it('keeps a zoom window inside the map', () => {
    const a = mapArea('germany');
    const w = zoomWindow('germany', MAP_MIN_BOX, { x: 0, y: 0 });
    expect(w.x).toBe(0);
    expect(w.y).toBe(0);
    const e = zoomWindow('germany', MAP_MIN_BOX, { x: a.width, y: a.height });
    expect(e.x + e.width).toBeCloseTo(a.width, 6);
    expect(e.y + e.height).toBeCloseTo(a.height, 6);
  });

  it('chooses the zone a tap is in, the tropics between the tropics', () => {
    const a = mapArea('world');
    const [, y] = toUnits(a, 10, 0);
    const s = zoomScale('world', MAP_MIN_BOX);
    expect(mapTap('world', 'zones', s, { x: 1000, y }, true, s)).toEqual({
      kind: 'feature',
      id: 'z-tropics',
    });
    const [, y2] = toUnits(a, 50, 0);
    expect(mapTap('world', 'zones', s, { x: 1000, y: y2 }, true, s)).toEqual({
      kind: 'feature',
      id: 'z-north-temperate',
    });
  });
});

describe('compass', () => {
  it('says which way one Land lies from another, from their anchors', () => {
    const ni = feature('germany', 'areas', 'DE-NI');
    const by = feature('germany', 'areas', 'DE-BY');
    expect(compass(ni, by)).toBe('s');
    expect(compass(by, ni)).toBe('n');
    const sl = feature('germany', 'areas', 'DE-SL');
    const mv = feature('germany', 'areas', 'DE-MV');
    expect(compass(sl, mv)).toBe('ne');
    expect(compass(mv, sl)).toBe('sw');
  });
});
