// The numbers of a labelled picture as a schoolbook prints them (#252): beside the drawing, never on
// it, none on another, each joined to its part by a leader line that crosses no other and runs over
// no other number's part — for every drawing of the library, with as many numbers as a question may
// carry, at 360 and 390 pt.

import { describe, expect, it } from 'vitest';

import {
  columnLabels,
  pointToSegment,
  segmentsCross,
} from '../../../../../packages/shared-math/src/labelBoxes.js';
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
/** How near a leader may pass another number's point: two parts side by side leave no more. */
const CLEAR = 6;

type XY = { x: number; y: number };
const xy = ([x, y]: readonly number[]): XY => ({ x: x!, y: y! });

/** Every six parts in a row, and every other part: each part numbered, beside different neighbours. */
function numberings(ids: readonly string[]): string[][] {
  const rows = Array.from({ length: Math.max(1, ids.length - 5) }, (_, i) => ids.slice(i, i + 6));
  const every = (k: number) => ids.filter((_, i) => i % 2 === k).slice(0, 6);
  return [...rows, every(0), every(1)];
}

describe('schematicLayout', () => {
  for (const d of SCHEMATIC_IDS) {
    for (const n of numberings(schematic(d).parts.map((p) => p.id))) {
      for (const width of WIDTHS) {
        it(`${d} (${n.join(', ')}) at ${width} pt`, () => {
          const fig: SchematicFig = { type: 'schematic', d, n, ask: 0 };
          const l = schematicLayout(fig, width, SCHEMATIC_SHAPES[d]);
          // The drawing as it is cut to its bounds (#462).
          const [bx0, , bx1] = schematic(d).bounds;
          const left = l.x0 + bx0 * l.k;
          const right = l.x0 + bx1 * l.k;
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
            l.badges.forEach((other, j) => {
              if (j === i) return;
              const which = `${i + 1} and ${j + 1}`;
              expect(Math.hypot(at[0] - other.at[0], at[1] - other.at[1]), which).toBeGreaterThan(
                2 * BADGE_R,
              );
              expect(segmentsCross(xy(from), xy(at), xy(other.from), xy(other.at)), which).toBe(
                false,
              );
              expect(pointToSegment(xy(other.from), xy(from), xy(at)), which).toBeGreaterThan(
                CLEAR,
              );
            });
          });
        });
      }
    }
  }

  it('with numbers it is cut to its bounds; kept to a height, it is centred between its columns (#462)', () => {
    const fig: SchematicFig = {
      type: 'schematic',
      d: 'skeleton',
      n: ['Schädel', 'Becken'],
      ask: 1,
    };
    const [bx0, by0, bx1, by1] = schematic('skeleton').bounds;
    const full = schematicLayout(fig, 312, null);
    // The narrow skeleton fills the room between the columns: more than twice the frame's scale.
    expect(full.k).toBeCloseTo((312 - 2 * 34) / (bx1 - bx0));
    expect(full.height).toBeCloseTo((by1 - by0) * full.k);
    const kept = schematicLayout(fig, 312, null, full.height * 0.6);
    expect(kept.width).toBe(312);
    expect(kept.height).toBeCloseTo(full.height * 0.6);
    // Its middle stays in the middle of the room.
    expect(kept.x0 + ((bx0 + bx1) / 2) * kept.k).toBeCloseTo(156);
    // A picture to tap keeps the whole frame and its width, whatever the height.
    const tap = schematicLayout({ ...fig, n: [], ask: 0 }, 312, null, 100);
    expect(tap.k).toBeCloseTo(312 / REGION_FRAME);
  });

  it('without numbers the drawing fills the width, as a tap needs it', () => {
    const l = schematicLayout({ type: 'schematic', d: 'eye', n: [], ask: 0 }, 312, null);
    expect(l).toMatchObject({ x0: 0, y0: 0, k: 312 / REGION_FRAME, badges: [] });
    expect(l.height).toBeCloseTo((schematic('eye').height * 312) / REGION_FRAME);
  });
});

describe('columnLabels', () => {
  const room = { left: 0, right: 100, top: 0, bottom: 100, pitch: 20 };

  it('keeps each number at its point’s height, on its own side, while there is room', () => {
    expect(
      columnLabels(
        [
          { x: 10, y: 50 },
          { x: 90, y: 20 },
        ],
        room,
      ),
    ).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 20 },
    ]);
  });

  it('sends a leader that would run over another point to the other side', () => {
    const slots = columnLabels(
      [
        { x: 10, y: 52 },
        { x: 20, y: 50 },
        { x: 30, y: 98 },
      ],
      { ...room, top: 10, bottom: 90 },
    );
    expect(slots).toEqual([
      { x: 0, y: 52 },
      { x: 100, y: 50 },
      { x: 0, y: 90 },
    ]);
  });

  it('moves the points nearest the middle to the other column when one is full', () => {
    const slots = columnLabels(
      [10, 20, 30, 40].map((x, i) => ({ x, y: i * 10 })),
      { ...room, bottom: 40 },
    );
    expect(slots.map((s) => s.x)).toEqual([0, 0, 0, 100]);
  });
});
