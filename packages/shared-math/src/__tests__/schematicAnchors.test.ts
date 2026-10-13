// Where the parts of the picture library's images stand (issue #599): the anchors line up with
// the names part by part, every tap area is a finger wide and lies in its frame, a finger means
// the part whose area holds it — the nearest anchor where two overlap or none does — and a tap is
// asked only for a part whose anchor stands clear of its neighbours'.

import { describe, expect, it } from 'vitest';

import { FIGURE_NAMES } from '../figureNames.data.js';
import { SCHEMATIC_ANCHORS } from '../schematicAnchors.data.js';
import { SCHEMATIC_SHAPES } from '../schematicShapes.data.js';
import {
  anchorAt,
  anchorFinger,
  SCHEMATIC_IDS,
  SCHEMATIC_IMAGE_IDS,
  SCHEMATIC_IMAGE_WIDTH,
  schematic,
  schematicFrame,
  schematicPart,
  schematicTappable,
  type SchematicId,
  type SchematicImageId,
} from '../schematics.js';

const PLACES = { anchors: SCHEMATIC_ANCHORS, shapes: SCHEMATIC_SHAPES };
const index = (d: SchematicId, id: string) => schematicPart(FIGURE_NAMES, d, id)!;

describe('the anchors of the images', () => {
  it('every image has them, for exactly its parts, in the order of their names', () => {
    expect(Object.keys(SCHEMATIC_ANCHORS)).toEqual(SCHEMATIC_IMAGE_IDS);
    for (const d of SCHEMATIC_IMAGE_IDS) {
      expect(
        SCHEMATIC_ANCHORS[d].map((a) => a.id),
        d,
      ).toEqual(schematic(FIGURE_NAMES, d).parts.map((p) => p.id));
    }
  });

  it('every anchor, number and tap area lies in its frame; a tap area is at least 44 × 44', () => {
    for (const d of SCHEMATIC_IMAGE_IDS) {
      const { width, height } = schematicFrame(d);
      expect(width).toBe(SCHEMATIC_IMAGE_WIDTH);
      for (const a of SCHEMATIC_ANCHORS[d]) {
        const where = `${d}.${a.id}`;
        for (const [x, y] of [a.at, a.badge]) {
          expect(x >= 0 && x <= width && y >= 0 && y <= height, where).toBe(true);
        }
        const [x, y, w, h] = a.tap;
        expect(Math.min(w, h), where).toBeGreaterThanOrEqual(44);
        expect(x >= 0 && y >= 0 && x + w <= width && y + h <= height, where).toBe(true);
        // Its own anchor lies in its tap area: a finger on the part hits it.
        expect(a.at[0] >= x && a.at[0] <= x + w && a.at[1] >= y && a.at[1] <= y + h, where).toBe(
          true,
        );
      }
    }
  });

  it('no two numbers of one image stand on each other', () => {
    for (const d of SCHEMATIC_IMAGE_IDS) {
      const badges = SCHEMATIC_ANCHORS[d].map((a) => a.badge);
      badges.forEach((b, i) => {
        for (const c of badges.slice(i + 1)) {
          expect(Math.hypot(b[0] - c[0], b[1] - c[1]), d).toBeGreaterThanOrEqual(20);
        }
      });
    }
  });
});

describe('which part a finger means (`anchorAt`)', () => {
  const cell = SCHEMATIC_ANCHORS.plant_cell;

  it('a finger on a part’s anchor means that part, in every image', () => {
    for (const d of SCHEMATIC_IMAGE_IDS) {
      SCHEMATIC_ANCHORS[d].forEach((a, i) => {
        expect(anchorAt(SCHEMATIC_ANCHORS[d], a.at[0], a.at[1]), `${d}.${a.id}`).toBe(i);
      });
    }
  });

  it('inside one tap area: that part', () => {
    // The nucleus' area is [155, 101, 44, 44]; its right edge lies in no other area.
    expect(anchorAt(cell, 197, 110)).toBe(index('plant_cell', 'nucleus'));
  });

  it('where two tap areas overlap, the anchor nearest the finger wins', () => {
    const [membrane, wall] = [index('plant_cell', 'membrane'), index('plant_cell', 'wall')];
    const [m, w] = [cell[membrane]!, cell[wall]!];
    // Both areas hold both anchors: ten units apart, each area 44 wide.
    const inside = (a: typeof m, x: number, y: number) =>
      x >= a.tap[0] && x <= a.tap[0] + a.tap[2] && y >= a.tap[1] && y <= a.tap[1] + a.tap[3];
    expect(inside(m, w.at[0], w.at[1]) && inside(w, m.at[0], m.at[1])).toBe(true);
    expect(anchorAt(cell, m.at[0] + 1, m.at[1])).toBe(membrane);
    expect(anchorAt(cell, w.at[0] - 1, w.at[1])).toBe(wall);
  });

  it('outside every tap area a tap still means a part: the nearest anchor', () => {
    // The frame's top right corner: no area reaches it; the nucleus is the nearest.
    expect(cell.some((a) => 300 <= a.tap[0] + a.tap[2] && 0 >= a.tap[1])).toBe(false);
    expect(anchorAt(cell, 300, 0)).toBe(index('plant_cell', 'nucleus'));
  });

  it('a row picture is tapped by its cells: anywhere in a cell means its sign', () => {
    const signs = SCHEMATIC_ANCHORS.signs;
    expect(anchorAt(signs, 5, 5)).toBe(index('signs', 'stop'));
    expect(anchorAt(signs, 195, 95)).toBe(index('signs', 'give_way'));
    expect(anchorAt(signs, 105, 105)).toBe(index('signs', 'cycle_path'));
    expect(anchorAt(signs, 295, 195)).toBe(index('signs', 'one_way'));
  });

  it('drawn narrower than its frame, a tap area keeps a finger’s width on the screen', () => {
    const plant = SCHEMATIC_ANCHORS.plant;
    const [stem, leaf] = [index('plant', 'stem'), index('plant', 'leaf')];
    const [x, y, w] = plant[stem]!.tap;
    // 30 units right of the stem's area — nearer to the leaf's anchor? No: the stem's is nearer
    // either way; what changes is whether the stem's AREA holds the point.
    expect(anchorFinger(300)).toBe(44);
    expect(anchorFinger(150)).toBe(88);
    const held = (least: number) => {
      const grown = Math.max(w, least);
      return x + w + 15 <= x + (w - grown) / 2 + grown;
    };
    expect(held(anchorFinger(300))).toBe(false);
    expect(held(anchorFinger(150))).toBe(true);
    expect(anchorAt(plant, x + w + 15, y + 22, anchorFinger(150))).toBe(stem);
    expect(stem).not.toBe(leaf);
  });
});

describe('what a tap may ask for (`schematicTappable`)', () => {
  it('only a part whose anchor stands 24 pt clear of the next, in the smallest room', () => {
    // Their anchors stand closer than 24 pt to the next one on a 360 × 740 phone: named with a
    // number, never tapped.
    const NAMED_ONLY: Partial<Record<SchematicImageId, string[]>> = {
      plant_cell: ['membrane', 'wall'],
      animal_cell: ['nucleus', 'nucleolus'],
      eye: ['cornea', 'pupil'],
      insect: ['head', 'eye'],
      microscope: ['revolver', 'objective'],
      skeleton: [
        'spine',
        'pelvis',
        'ribcage',
        'sternum',
        'radius',
        'ulna',
        'femur',
        'kneecap',
        'tibia',
        'fibula',
      ],
      organs: ['large_intestine', 'small_intestine', 'bladder', 'stomach', 'heart'],
      eye_front: ['sclera', 'cornea', 'ciliary', 'pupil'],
      joint: ['cavity', 'socket'],
      digestion: ['liver', 'gallbladder'],
      distillation: ['receiver', 'distillate', 'round_flask', 'boiling_chips'],
    };
    for (const d of SCHEMATIC_IMAGE_IDS) {
      schematic(FIGURE_NAMES, d).parts.forEach(({ id }, i) => {
        expect(schematicTappable(PLACES, d, i), `${d}.${id}`).toBe(!NAMED_ONLY[d]?.includes(id));
      });
    }
  });

  it('every cell of a row picture can be tapped', () => {
    for (const d of ['signs', 'instruments', 'anlaut', 'moon_phases'] as const) {
      SCHEMATIC_ANCHORS[d].forEach((a, i) => {
        expect(schematicTappable(PLACES, d, i), `${d}.${a.id}`).toBe(true);
      });
    }
  });

  it('the circuit, which has no anchors, is still decided by its outlines', () => {
    const tappable = (id: string) => schematicTappable(PLACES, 'circuit', index('circuit', id));
    expect(SCHEMATIC_IDS).toContain('circuit');
    expect(Object.keys(SCHEMATIC_ANCHORS)).not.toContain('circuit');
    expect(tappable('battery')).toBe(true);
    expect(tappable('switch')).toBe(true);
  });
});
