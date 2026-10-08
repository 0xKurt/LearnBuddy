// A stumme Karte next to a question (issue #251): the map keeps its room while its shapes load
// (awaited, never a fixed time: #481), then draws every region — the marked one filled — and what a screen reader hears is the map and
// the marked regions in words, in her language, never more.
//
// Names and shapes are packages/shared-math/src/__tests__/maps.test.ts; the drawing at 360 and
// 390 pt, light and dark, is tests/web/tap-figures.spec.ts.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../../../../../packages/shared-math/src/figureNames.data.js';
import { useFigureNames } from '../../../lib/math/useFigureNames.js';
import { useMapShapes } from '../../../lib/math/useMapShapes.js';
import { renderInApp, whenLoaded } from '../../../testing/render.js';
import { describeMap, MapBody, mapDrawHeight, type MapFigure } from '../MapFigures.js';
import { describeSchoolFigure } from '../schoolFigures.js';

const t = (key: string, values: Record<string, string | number> = {}) =>
  `${key}${Object.keys(values).length ? ` ${JSON.stringify(values)}` : ''}`;

const de: MapFigure = { type: 'map', v: 'de', hl: ['BY'], l: 'regions' as const };

describe('MapBody', () => {
  it('keeps its height while loading, then draws all 16 Länder, the marked one filled', async () => {
    const { container } = renderInApp(<MapBody figure={de} width={300} />);
    expect(mapDrawHeight(de, 300)).toBeGreaterThan(300); // Germany stands upright
    // The land (16 in one layer), the marked Land once more in full, the 16 borders on top.
    await whenLoaded(useMapShapes, useFigureNames);
    expect(container.querySelectorAll('path').length).toBe(33);
    expect(container.querySelectorAll('g path')).toHaveLength(16);
    const filled = Array.from(container.querySelectorAll('path')).filter(
      (p) => p.getAttribute('fill') !== 'none',
    );
    expect(filled).toHaveLength(17);
  });

  it('draws a continent as one outline: its coast under the land, no border on top', async () => {
    const world: MapFigure = { type: 'map', v: 'world', hl: [], l: 'regions' as const };
    const { container } = renderInApp(<MapBody figure={world} width={300} />);
    await whenLoaded(useMapShapes, useFigureNames);
    expect(container.querySelectorAll('path').length).toBe(21);
  });
});

describe('MapBody with her own Land (#429)', () => {
  it('outlines her Land dashed in the accent, wider than a border, never filled', async () => {
    const f: MapFigure = { ...de, hl: [], home: 'NI' };
    const { container } = renderInApp(<MapBody figure={f} width={300} />);
    // The land, the 16 borders and her Land's outline on top.
    await whenLoaded(useMapShapes, useFigureNames);
    expect(container.querySelectorAll('path').length).toBe(33);
    const outline = Array.from(container.querySelectorAll('path')).at(-1);
    expect(outline?.getAttribute('fill')).toBe('none');
    expect(outline?.getAttribute('stroke-width')).toBe('2.2');
    expect(outline?.getAttribute('stroke-dasharray')).toBe('6 4');
  });

  it('says it in words after the marked one', () => {
    expect(describeMap({ ...de, home: 'NI' }, t, FIGURE_NAMES)).toBe(
      'figure.map_de {"count":16} figure.map_marked {"names":"Bayern"} figure.map_home {"name":"Niedersachsen"}',
    );
  });
});

describe('MapBody with a layer of places (#429)', () => {
  it('draws the capitals as dots on the land, the marked one larger', async () => {
    const f: MapFigure = { ...de, l: 'cities', hl: ['München'] };
    const { container } = renderInApp(<MapBody figure={f} width={300} />);
    await whenLoaded(useMapShapes, useFigureNames);
    expect(container.querySelectorAll('circle').length).toBeGreaterThan(10);
    const r = Array.from(container.querySelectorAll('circle')).map((c) => c.getAttribute('r'));
    expect(r.filter((v) => v === '5.5')).toHaveLength(1);
  });
});

describe('MapBody with its Gradnetz (#429)', () => {
  it('draws the meridians and parallels, their degrees at the edge, the marked crossing as a dot', async () => {
    const f: MapFigure = { type: 'map', v: 'world', hl: ['30° S, 60° W'], l: 'grid' };
    const { container } = renderInApp(<MapBody figure={f} width={320} />);
    await whenLoaded(useMapShapes, useFigureNames);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.querySelector('circle')?.getAttribute('r')).toBe('5.5');
    // Each label twice: its paper halo, then the text.
    const labels = Array.from(container.querySelectorAll('text')).map((n) => n.textContent);
    expect(labels).toContain('0°');
    expect(labels).toContain('30° S');
    expect(labels).toContain('90° W');
  });
});

describe('describeMap', () => {
  it('names the map and the marked region — by its id or any of its names', () => {
    expect(describeMap(de, t, FIGURE_NAMES)).toBe(
      'figure.map_de {"count":16} figure.map_marked {"names":"Bayern"}',
    );
    expect(describeMap({ ...de, hl: ['Bavaria'] }, t, FIGURE_NAMES)).toContain('"names":"Bayern"');
    expect(
      describeMap({ type: 'map', v: 'europe', hl: [], l: 'regions' as const }, t, FIGURE_NAMES),
    ).toBe('figure.map_europe {"count":40}');
  });

  it('says which layer of places the map shows (#429) and names the marked one', () => {
    expect(describeMap({ ...de, l: 'rivers', hl: ['Rhine'] }, t, FIGURE_NAMES)).toBe(
      'figure.map_de {"count":16} figure.map_rivers figure.map_marked {"names":"Rhein"}',
    );
  });

  it('says how far apart the lines of the Gradnetz are, and where the marked crossing is (#429)', () => {
    expect(
      describeMap({ type: 'map', v: 'world', hl: ['30° S, 60° W'], l: 'grid' }, t, FIGURE_NAMES),
    ).toBe(
      'figure.map_world {"count":7} figure.map_grid {"step":30} figure.map_marked {"names":"30° S, 60° W"}',
    );
  });

  it('says the map is coming until its names are loaded (#440), never a part of it', () => {
    expect(describeSchoolFigure(de, t, null)).toBe('figure.loading');
    expect(describeSchoolFigure(de, t, FIGURE_NAMES)).toBe(describeMap(de, t, FIGURE_NAMES));
  });
});
