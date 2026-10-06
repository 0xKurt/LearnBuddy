// The numbers of a labelled picture as a schoolbook prints them (#252): beside the drawing, never on
// it, none on another, each joined to its part by a leader line that crosses no other — for every
// drawing of the library, with as many numbers as a question may carry, at 360 and 390 pt.

import { describe, expect, it } from 'vitest';

import { columnLabels } from '../../../../../packages/shared-math/src/labelBoxes.js';
import { REGION_FRAME } from '../../../../../packages/shared-math/src/regions.js';
import { SCHEMATIC_SHAPES } from '../../../../../packages/shared-math/src/schematicShapes.data.js';
import {
  SCHEMATIC_IDS,
  schematic,
  type SchematicFig,
} from '../../../../../packages/shared-math/src/schematics.js';
import { BADGE_R, schematicLayout } from '../schematicLayout.js';

/** The cards' widths on a 360 and a 390 pt phone. */
const WIDTHS = [312, 342];

/** Whether the segments ab and cd cross. */
function cross(a: number[], b: number[], c: number[], d: number[]): boolean {
  const side = (p: number[], q: number[], r: number[]) =>
    Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

describe('schematicLayout', () => {
  for (const d of SCHEMATIC_IDS) {
    // The first six parts, then the last six: every part numbered once somewhere.
    const parts = schematic(d).parts.map((p) => p.id);
    for (const n of [parts.slice(0, 6), parts.slice(-6)]) {
      for (const width of WIDTHS) {
        it(`${d} (${n.join(', ')}) at ${width} pt`, () => {
          const fig: SchematicFig = { type: 'schematic', d, n, ask: 0 };
          const l = schematicLayout(fig, width, SCHEMATIC_SHAPES[d]);
          const left = l.x0;
          const right = l.x0 + REGION_FRAME * l.k;
          expect(l.badges).toHaveLength(n.length);
          l.badges.forEach(({ from, at }, i) => {
            // Beside the drawing, inside the room, its leader from its own part's point.
            expect(at[0] + BADGE_R <= left || at[0] - BADGE_R >= right, `${i + 1}`).toBe(true);
            expect(at[0] - BADGE_R).toBeGreaterThanOrEqual(0);
            expect(at[0] + BADGE_R).toBeLessThanOrEqual(width);
            expect(at[1] - BADGE_R).toBeGreaterThanOrEqual(0);
            expect(at[1] + BADGE_R).toBeLessThanOrEqual(l.height);
            const p = SCHEMATIC_SHAPES[d].parts.find((s) => s.id === n[i])!.at;
            expect(from).toEqual([l.x0 + p[0] * l.k, l.y0 + p[1] * l.k]);
            l.badges.slice(i + 1).forEach((other, j) => {
              const apart = Math.hypot(at[0] - other.at[0], at[1] - other.at[1]);
              expect(apart, `${i + 1} and ${i + j + 2}`).toBeGreaterThan(2 * BADGE_R);
              expect(cross(from, at, other.from, other.at), `${i + 1} × ${i + j + 2}`).toBe(false);
            });
          });
        });
      }
    }
  }

  it('without numbers the drawing fills the width, as a tap needs it', () => {
    const l = schematicLayout({ type: 'schematic', d: 'eye', n: [], ask: 0 }, 312, null);
    expect(l).toMatchObject({ x0: 0, y0: 0, k: 312 / REGION_FRAME, badges: [] });
    expect(l.height).toBeCloseTo((schematic('eye').height * 312) / REGION_FRAME);
  });
});

describe('columnLabels', () => {
  it('keeps each number at its point’s height while there is room', () => {
    const slots = columnLabels(
      [
        { x: 10, y: 50 },
        { x: 90, y: 20 },
      ],
      { left: 0, right: 100, top: 0, bottom: 100, pitch: 20 },
    );
    expect(slots).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 20 },
    ]);
  });

  it('spreads numbers that would stand on each other, in the order of their points', () => {
    const slots = columnLabels(
      [
        { x: 10, y: 52 },
        { x: 20, y: 50 },
        { x: 30, y: 98 },
      ],
      { left: 0, right: 100, top: 10, bottom: 90, pitch: 20 },
    );
    expect(slots.map((s) => s.x)).toEqual([0, 0, 0]);
    expect(slots.map((s) => s.y)).toEqual([70, 50, 90]);
  });

  it('moves the points nearest the middle to the other column when one is full', () => {
    const slots = columnLabels(
      [10, 20, 30, 40].map((x, i) => ({ x, y: i * 10 })),
      { left: 0, right: 100, top: 0, bottom: 40, pitch: 20 },
    );
    expect(slots.map((s) => s.x)).toEqual([0, 0, 0, 100]);
  });
});
