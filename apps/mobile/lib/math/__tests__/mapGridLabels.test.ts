// The degrees of a map's Gradnetz (#429): each at the edge where its line leaves the frame, inside
// the drawing, and none touching another — on a narrow phone every second (third …) one, the round
// degrees kept.

import { describe, expect, it } from 'vitest';

import { mapGrid } from '../../../../../packages/shared-math/src/mapGrid.js';
import { MAP_SHAPES } from '../../../../../packages/shared-math/src/mapShapes.data.js';
import { mapHeight, type MapBaseView } from '../../../../../packages/shared-math/src/maps.js';
import { REGION_FRAME } from '../../../../../packages/shared-math/src/regions.js';
import { gridLabels, type GridLabel } from '../mapGridLabels.js';

const SIZE = 12;
const labelsAt = (v: MapBaseView, width: number, lang = 'de') =>
  gridLabels(
    mapGrid(v)!,
    MAP_SHAPES[v].grid!,
    width,
    (mapHeight(v) * width) / REGION_FRAME,
    SIZE,
    lang,
  );
const overlap = (a: GridLabel, b: GridLabel) =>
  a.box.x0 < b.box.x1 && b.box.x0 < a.box.x1 && a.box.y0 < b.box.y1 && b.box.y0 < a.box.y1;

describe('the degrees of the Gradnetz', () => {
  it('on Germany 244 pt wide: every parallel, every second meridian', () => {
    const texts = labelsAt('de', 244).map((l) => l.text);
    expect(texts).toEqual([
      '6° O',
      '8° O',
      '10° O',
      '12° O',
      '14° O',
      '48° N',
      '49° N',
      '50° N',
      '51° N',
      '52° N',
      '53° N',
      '54° N',
      '55° N',
    ]);
  });

  it('in her language: east is E in English, west W', () => {
    const texts = labelsAt('europe', 320, 'en').map((l) => l.text);
    expect(texts).toContain('10° E');
    expect(texts).toContain('20° W');
    expect(texts).toContain('60° N');
  });

  it('stand inside the drawing, chip and all, and never touch, on every map and phone', () => {
    for (const v of ['de', 'europe', 'world'] as const) {
      for (const width of [244, 320, 358]) {
        const height = (mapHeight(v) * width) / REGION_FRAME;
        const labels = labelsAt(v, width);
        expect(labels.length, `${v} ${width}`).toBeGreaterThan(3);
        for (const l of labels) {
          const b = l.box;
          expect(b.x0, `${v} ${width} ${l.text}`).toBeGreaterThanOrEqual(0);
          expect(b.x1, `${v} ${width} ${l.text}`).toBeLessThanOrEqual(width);
          expect(b.y0, `${v} ${width} ${l.text}`).toBeGreaterThanOrEqual(0);
          expect(b.y1, `${v} ${width} ${l.text}`).toBeLessThanOrEqual(height);
        }
        labels.forEach((a, i) =>
          labels
            .slice(i + 1)
            .forEach((b) => expect(overlap(a, b), `${a.text} / ${b.text}`).toBe(false)),
        );
      }
    }
  });
});
