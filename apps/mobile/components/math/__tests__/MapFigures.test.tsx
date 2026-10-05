// A stumme Karte next to a question (issue #251): the map keeps its room while its shapes load,
// then draws every region — the marked one filled — and what a screen reader hears is the map and
// the marked regions in words, in her language, never more.
//
// Names and shapes are packages/shared-math/src/__tests__/maps.test.ts; the drawing at 360 and
// 390 pt, light and dark, is tests/web/tap-figures.spec.ts.

import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderInApp } from '../../../testing/render.js';
import { describeMap, MapBody, mapDrawHeight, type MapFigure } from '../MapFigures.js';

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

const de: MapFigure = { type: 'map', v: 'de', hl: ['BY'] };

describe('MapBody', () => {
  it('keeps its height while loading, then draws all 16 Länder, the marked one filled', async () => {
    const { container } = renderInApp(<MapBody figure={de} width={300} />);
    expect(mapDrawHeight(de, 300)).toBeGreaterThan(300); // Germany stands upright
    // The land (16 in one layer), the marked Land once more in full, the 16 borders on top.
    await waitFor(() => expect(container.querySelectorAll('path').length).toBe(33));
    expect(container.querySelectorAll('g path')).toHaveLength(16);
    const filled = Array.from(container.querySelectorAll('path')).filter(
      (p) => p.getAttribute('fill') !== 'none',
    );
    expect(filled).toHaveLength(17);
  });

  it('draws a continent as one outline: its coast under the land, no border on top', async () => {
    const world: MapFigure = { type: 'map', v: 'world', hl: [] };
    const { container } = renderInApp(<MapBody figure={world} width={300} />);
    await waitFor(() => expect(container.querySelectorAll('path').length).toBe(21));
  });
});

describe('describeMap', () => {
  it('names the map and the marked region — by its id or any of its names', () => {
    expect(describeMap(de, t)).toBe(
      'figure.map_de {"count":16} figure.map_marked {"names":"Bayern"}',
    );
    expect(describeMap({ ...de, hl: ['Bavaria'] }, t)).toContain('"names":"Bayern"');
    expect(describeMap({ type: 'map', v: 'europe', hl: [] }, t)).toBe(
      'figure.map_europe {"count":40}',
    );
  });
});
