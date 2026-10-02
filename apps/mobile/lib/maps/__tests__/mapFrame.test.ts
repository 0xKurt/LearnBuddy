import { describe, expect, it } from 'vitest';

import { mapFeature, MAP_MIN_BOX } from '../../../../../packages/shared-maps/src/index.js';
import {
  gutterOf,
  lookWindow,
  mapSize,
  markCentre,
  onMap,
  tapOnMap,
  wholeMap,
  type MapFig,
} from '../mapFrame.js';

const germany: MapFig = {
  kind: 'map',
  area: 'germany',
  layer: 'areas',
  ask: 'tap',
  mark: null,
  graticule: false,
};

/** Map units → pt on a map of this size showing the whole of Germany. */
const pt = (size: { width: number; height: number }, x: number, y: number) => {
  const w = wholeMap('germany');
  return { x: (x / w.width) * size.width, y: (y / w.height) * size.height };
};

describe('a tap on the map of the Länder (360×740)', () => {
  const size = mapSize('germany', MAP_MIN_BOX);

  it('chooses Bayern on the first tap', () => {
    const by = mapFeature('germany', 'areas', 'DE-BY')!;
    const at = pt(size, by.anchor[0], by.anchor[1]);
    expect(tapOnMap(germany, size, null, at.x, at.y)).toEqual({ kind: 'feature', id: 'DE-BY' });
  });

  it('magnifies near Berlin, and the second tap chooses Berlin', () => {
    const be = mapFeature('germany', 'areas', 'DE-BE')!;
    const at = pt(size, be.anchor[0], be.anchor[1]);
    const first = tapOnMap(germany, size, null, at.x, at.y);
    expect(first.kind).toBe('zoom');
    const win = first.window!;
    expect(win.width).toBeLessThan(wholeMap('germany').width);
    const x = ((be.anchor[0] - win.x) / win.width) * size.width;
    const y = ((be.anchor[1] - win.y) / win.height) * size.height;
    expect(tapOnMap(germany, size, win, x, y)).toEqual({ kind: 'feature', id: 'DE-BE' });
  });
});

describe('a map she reads', () => {
  const read: MapFig = {
    ...germany,
    layer: 'cities',
    ask: 'coords',
    graticule: true,
    mark: { form: 'point', x: 1500, y: 900 },
  };

  it('magnifies round the mark, inside the map', () => {
    const size = mapSize('germany', MAP_MIN_BOX);
    const w = lookWindow(read, size, null);
    expect(w.x).toBeLessThanOrEqual(1500);
    expect(w.x + w.width).toBeGreaterThanOrEqual(1500);
    expect(w.x + w.width).toBeLessThanOrEqual(wholeMap('germany').width + 1e-6);
    expect(markCentre(read)).toEqual({ x: 1500, y: 900 });
  });

  it('keeps room for the degrees beside and under a graticule only', () => {
    expect(gutterOf(read)).toEqual({ left: 40, bottom: 18 });
    expect(gutterOf(germany)).toEqual({ left: 0, bottom: 0 });
  });

  it('keeps only answers that fit the question in the draft', () => {
    expect(onMap(read, { kind: 'map_coords', lat: 52, lon: 13 })).toBe(true);
    expect(onMap(read, { kind: 'map_coords', lat: 52.5, lon: 13 })).toBe(false);
    expect(onMap(germany, { kind: 'map', id: 'DE-BY' })).toBe(true);
    expect(onMap(germany, { kind: 'map', id: 'ITA' })).toBe(false);
    expect(onMap({ ...germany, ask: 'name' }, { kind: 'map_name', text: ' ' })).toBe(false);
  });
});
