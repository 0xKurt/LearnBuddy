// Where the parts of the picture library's images stand (issue #599): the anchors line up with
// the names part by part, every tap area is a finger wide and lies in its frame, a finger means
// the part whose area holds it — NOTHING outside every area —, no two areas of one image overlap,
// and a tap is asked only for a part that has an area (its structure is covered by one) and whose
// anchor stands clear of its neighbours'.

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

  it('every anchor and number lies in its frame; a tap area lies in it too and holds its anchor', () => {
    for (const d of SCHEMATIC_IMAGE_IDS) {
      const { width, height } = schematicFrame(d);
      expect(width).toBe(SCHEMATIC_IMAGE_WIDTH);
      for (const a of SCHEMATIC_ANCHORS[d]) {
        const where = `${d}.${a.id}`;
        for (const [x, y] of [a.at, a.badge]) {
          expect(x >= 0 && x <= width && y >= 0 && y <= height, where).toBe(true);
        }
        if (!a.tap) continue;
        const [x, y, w, h] = a.tap;
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
  it('a finger on the anchor of a part with a tap area means that part, in every image', () => {
    for (const d of SCHEMATIC_IMAGE_IDS) {
      SCHEMATIC_ANCHORS[d].forEach((a, i) => {
        if (!a.tap) return;
        expect(anchorAt(SCHEMATIC_ANCHORS[d], a.at[0], a.at[1]), `${d}.${a.id}`).toBe(i);
      });
    }
  });

  it('inside one tap area: that part', () => {
    // The skull's area is [122, 0, 56, 56]; no other area of the skeleton is left.
    expect(anchorAt(SCHEMATIC_ANCHORS.skeleton, 130, 40)).toBe(index('skeleton', 'skull'));
  });

  it('no two tap areas of one image overlap, and each is a finger wide, in the smallest room', () => {
    // A picture to tap stands at least as large as in the smallest room (`REGION_TAP_BOX`: 320 pt
    // wide, or narrower where 330 pt of height allow less). There every area must be 44 pt each
    // way and meet no other — else a finger on one structure would be taken for its neighbour.
    const overlaps: string[] = [];
    for (const d of SCHEMATIC_IMAGE_IDS) {
      const pt = Math.min(320, (330 * 300) / schematicFrame(d).height) / 300;
      const areas = SCHEMATIC_ANCHORS[d].flatMap((a) => (a.tap ? [{ id: a.id, tap: a.tap }] : []));
      for (const { id, tap } of areas) {
        expect(Math.min(tap[2], tap[3]) * pt, `${d}.${id} on the screen`).toBeGreaterThanOrEqual(
          44,
        );
        // And in the frame itself: on a 360-pt phone a picture stands 302 pt wide in its card,
        // not 320 — the flower's style, 42 high, was 42.3 pt there (#599 correction).
        expect(Math.min(tap[2], tap[3]), `${d}.${id} in its frame`).toBeGreaterThanOrEqual(44);
      }
      areas.forEach((p, i) => {
        for (const q of areas.slice(i + 1)) {
          const [ax, ay, aw, ah] = p.tap;
          const [bx, by, bw, bh] = q.tap;
          if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah)
            overlaps.push(`${d}: ${p.id} / ${q.id}`);
        }
      });
    }
    expect(overlaps).toEqual([]);
  });

  it('a finger on a structure means that part, never the neighbour its old area reached', () => {
    // Read off the images (review of #599, round two): the stomach's lower left was taken for the
    // pancreas, the ovary's bulb for the ovule, the coarse-focus knob's lower right for the fine
    // focus. In the frame's units, at the frame's size and in the smallest room.
    const ON: Array<[SchematicImageId, string, number, number]> = [
      ['digestion', 'stomach', 172, 248],
      ['digestion', 'stomach', 195, 225],
      ['flower_section', 'ovary', 140, 130],
      ['flower_section', 'ovary', 150, 110],
      ['flower', 'ovary', 140, 130],
      ['microscope', 'coarse_focus', 255, 290],
      ['microscope', 'coarse_focus', 240, 265],
      ['flower', 'style', 152, 70],
      ['flower', 'stigma', 158, 40],
      ['breathing', 'mouth', 120, 100],
      ['ear', 'eardrum', 170, 150],
      ['ear', 'ossicles', 162, 105],
    ];
    for (const [d, id, x, y] of ON) {
      for (const least of [
        0,
        anchorFinger(Math.min(320, (330 * 300) / schematicFrame(d).height)),
      ]) {
        expect(anchorAt(SCHEMATIC_ANCHORS[d], x, y, least), `${d}.${id} at ${x}, ${y}`).toBe(
          index(d, id),
        );
      }
    }
  });

  it('drawn smaller than the smallest room, a finger in two grown areas means neither', () => {
    // The ossicles' and the eardrum's areas meet at y 120; grown to 88 units they both hold it.
    const ear = SCHEMATIC_ANCHORS.ear;
    expect(anchorAt(ear, 160, 119)).toBe(index('ear', 'ossicles'));
    expect(anchorAt(ear, 160, 121)).toBe(index('ear', 'eardrum'));
    expect(anchorAt(ear, 160, 120, anchorFinger(150))).toBeNull();
  });

  it('outside every tap area a tap means nothing — never the nearest part', () => {
    // The frame's corner beside the skull, and the white corner of the volcano's block.
    expect(anchorAt(SCHEMATIC_ANCHORS.skeleton, 299, 1)).toBeNull();
    expect(anchorAt(SCHEMATIC_ANCHORS.volcano, 280, 220)).toBeNull();
    // A picture none of whose parts has an area: no tap means anything.
    expect(anchorAt(SCHEMATIC_ANCHORS.teeth, 150, 20)).toBeNull();
  });

  it('a tap on a structure that is drawn twice or goes on elsewhere is never another part', () => {
    // Where the same structure stands a second time, or goes on, in the frame's units (read off
    // the images). Before, each of these was recorded as the part named after the arrow (review
    // of #599) — a right tap graded wrong.
    const ELSEWHERE: Array<[SchematicImageId, string, number, number]> = [
      ['breathing', 'the other lung → bronchi', 213, 253],
      ['organs', 'the other lung → heart', 167, 107],
      ['mushroom', 'the cap’s right half → ring', 253, 70],
      ['neuron', 'the third myelin segment → axon', 158, 320],
      ['neuron', 'the fourth myelin segment → terminals', 158, 347],
      ['neuron', 'a dendrite on the right → cell body', 227, 153],
      ['skeleton', 'the other arm → ribcage', 203, 120],
      ['skeleton', 'the other hand → spine', 225, 227],
      ['teeth', 'a lower incisor → gum', 150, 393],
      ['teeth', 'an upper molar on the other side → incisor', 240, 143],
      ['digestion', 'the ascending colon → gallbladder', 93, 303],
      ['digestion', 'the transverse colon → pancreas', 147, 300],
      ['heart', 'the descending aorta → right ventricle', 147, 353],
    ];
    for (const [d, what, x, y] of ELSEWHERE) {
      // At the frame's size and in the smallest room, where a tap area is a finger wide.
      for (const least of [0, anchorFinger(236)]) {
        expect(anchorAt(SCHEMATIC_ANCHORS[d], x, y, least), `${d}: ${what}`).toBeNull();
      }
    }
  });

  it('a part without a tap area is never picked, not even at its own anchor', () => {
    const lungs = SCHEMATIC_ANCHORS.breathing[index('breathing', 'lungs')]!;
    expect(lungs.tap).toBeNull();
    expect(anchorAt(SCHEMATIC_ANCHORS.breathing, lungs.at[0], lungs.at[1])).toBeNull();
  });

  it('a row picture is tapped by its cells: anywhere in a cell means its sign', () => {
    const signs = SCHEMATIC_ANCHORS.signs;
    expect(anchorAt(signs, 5, 5)).toBe(index('signs', 'stop'));
    expect(anchorAt(signs, 195, 95)).toBe(index('signs', 'give_way'));
    expect(anchorAt(signs, 105, 105)).toBe(index('signs', 'cycle_path'));
    expect(anchorAt(signs, 295, 195)).toBe(index('signs', 'one_way'));
  });

  it('drawn narrower than its frame, a tap area keeps a finger’s width on the screen', () => {
    const skeleton = SCHEMATIC_ANCHORS.skeleton;
    const skull = index('skeleton', 'skull');
    const [x, y, w] = skeleton[skull]!.tap!;
    expect(anchorFinger(300)).toBe(44);
    expect(anchorFinger(150)).toBe(88);
    // 15 units right of the skull's area: outside it at the frame's size, inside it at half size.
    expect(anchorAt(skeleton, x + w + 15, y + 22, anchorFinger(300))).toBeNull();
    expect(anchorAt(skeleton, x + w + 15, y + 22, anchorFinger(150))).toBe(skull);
  });
});

describe('what a tap may ask for (`schematicTappable`)', () => {
  // The parts with a tap area: their structure is covered by one — decided by looking at each of
  // the 240 parts on its image (docs/adr/0009 lists why each of the others is named only).
  const TAPPABLE: Record<SchematicImageId, string[]> = {
    plant_cell: ['chloroplast'],
    animal_cell: [],
    flower: ['receptacle', 'ovary', 'style', 'stigma'],
    plant: [],
    eye: ['optic_nerve'],
    tooth: [],
    insect: ['thorax'],
    bicycle: ['saddle', 'handlebar'],
    microscope: ['light', 'diaphragm', 'coarse_focus'],
    lab: [],
    heart: ['right_atrium', 'left_atrium'],
    ear: ['eustachian_tube', 'eardrum', 'ossicles', 'canals', 'cochlea', 'nerve'],
    skeleton: ['skull'],
    organs: ['liver', 'brain'],
    signs: ['stop', 'give_way', 'priority_road', 'crossing', 'cycle_path', 'one_way'],
    instruments: ['guitar', 'recorder', 'drum', 'trumpet', 'triangle', 'xylophone'],
    anlaut: ['apple', 'ball', 'house', 'sun', 'moon', 'fish', 'ice_cream', 'clock'],
    flower_section: ['receptacle', 'ovary', 'style', 'stigma'],
    eye_front: [],
    insect_head: [],
    teeth: [],
    joint: [],
    breathing: ['nasal_cavity', 'mouth', 'trachea'],
    digestion: ['stomach', 'appendix', 'rectum'],
    leaf: ['stoma'],
    neuron: ['nucleus'],
    mushroom: ['ring'],
    seedling: [],
    distillation: ['water_in', 'water_out'],
    earth: ['inner_core'],
    volcano: ['magma_chamber', 'side_vent', 'crater'],
    compass: ['northeast', 'southeast', 'southwest', 'northwest', 'north', 'east', 'south', 'west'],
    thermometer: ['bulb'],
    moon_phases: ['new_moon', 'first_quarter', 'full_moon', 'last_quarter'],
  };

  it('exactly the parts with a tap area — 75 of 240 — and each stands 24 pt clear of the next', () => {
    let [all, tappable] = [0, 0];
    for (const d of SCHEMATIC_IMAGE_IDS) {
      schematic(FIGURE_NAMES, d).parts.forEach(({ id }, i) => {
        const area = SCHEMATIC_ANCHORS[d][i]!.tap !== null;
        expect(area, `${d}.${id} has a tap area`).toBe(TAPPABLE[d].includes(id));
        // No part with an area is ruled out by its spacing: the two say the same today.
        expect(schematicTappable(PLACES, d, i), `${d}.${id}`).toBe(area);
        all++;
        if (area) tappable++;
      });
    }
    expect([tappable, all]).toEqual([75, 240]);
  });

  it('what is drawn twice, larger than an area or going on elsewhere is named, never tapped', () => {
    const NAMED: Array<[SchematicImageId, string]> = [
      ['breathing', 'lungs'],
      ['organs', 'lungs'],
      ['mushroom', 'cap'],
      ['neuron', 'myelin'],
      ['neuron', 'dendrites'],
      ['skeleton', 'humerus'],
      ['skeleton', 'hand'],
      ['teeth', 'incisor'],
      ['teeth', 'molar'],
      ['digestion', 'large_intestine'],
      ['heart', 'aorta'],
    ];
    for (const [d, id] of NAMED) {
      expect(schematicTappable(PLACES, d, index(d, id)), `${d}.${id}`).toBe(false);
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
