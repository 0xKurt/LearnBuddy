// Drawings of the picture library that show a small thing large (issue #462): the flower in
// section with nothing around it, the front of the eye, an insect's head. In the whole flower, the
// whole eye and the whole insect their small parts — the stigma, the lens, the pupil, the compound
// eye — are narrower than a finger on a phone and can only be named (`TAP_TARGET.picture`); here
// each stands large enough to be tapped, under the same ids and names (`schematicParts.data.ts`).
// Drawn by hand like every drawing of the library (`schematicShapes.data.ts` says how); the parts
// stand in the order of their names.

import {
  arc,
  box,
  circle,
  curve,
  ellipse,
  flip,
  mirror,
  shape,
  smooth,
  stroke,
  TONE,
} from './drawShapes.js';
import type { SchematicShape } from './schematics.js';

const { LILAC, BLUE, GREEN, ORANGE, PINK, YELLOW, SAND, TEAL, INK } = TONE;

// ── the flower in section ──────────────────────────────────────────────────
// As a schoolbook draws a cherry blossom cut through the middle: the pistil — stigma, style and
// the ovary with its ovule — on the receptacle, a stamen each side before and behind it, the petals
// and below them the sepals, the stalk under all of it.

const sepal = [
  400, 688, 320, 700, 220, 728, 120, 768, 70, 800, 115, 815, 210, 790, 310, 760, 400, 735,
];
const petal = [
  405, 655, 330, 560, 240, 450, 160, 330, 100, 220, 75, 160, 50, 220, 60, 340, 110, 470, 200, 590,
  300, 670, 390, 705,
];
/** A stamen's filament from the receptacle up, and its anther at the end. */
const filaments = [
  curve(405, 660, 340, 540, 280, 410, 250, 335),
  curve(435, 650, 410, 540, 385, 430, 372, 388),
];

const flowerSection: SchematicShape = {
  lines: [],
  parts: [
    shape('stalk', GREEN, [500, 860], [stroke(84, 500, 895, 500, 735)]),
    shape('sepal', TEAL, [230, 760], [smooth(...sepal), smooth(...mirror(sepal))]),
    shape('petal', PINK, [170, 460], [smooth(...petal), smooth(...mirror(petal))]),
    shape(
      'receptacle',
      SAND,
      [500, 715],
      [smooth(345, 695, 395, 655, 500, 642, 605, 655, 655, 695, 615, 742, 500, 758, 385, 742)],
    ),
    shape(
      'stamen',
      YELLOW,
      [245, 290],
      [
        ...filaments.flatMap((f, i) => [
          stroke(14 - 2 * i, ...f),
          stroke(14 - 2 * i, ...mirror(f)),
        ]),
        ellipse(245, 290, 34, 58, -12),
        ellipse(755, 290, 34, 58, 12),
        ellipse(368, 345, 26, 46, -6),
        ellipse(632, 345, 26, 46, 6),
      ],
    ),
    shape('ovary', LILAC, [500, 412], [ellipse(500, 520, 135, 150)]),
    shape('style', BLUE, [500, 270], [stroke(46, 500, 395, 500, 160)]),
    shape(
      'stigma',
      ORANGE,
      [500, 128],
      [smooth(415, 150, 440, 108, 500, 92, 560, 108, 585, 150, 545, 170, 500, 162, 455, 170)],
    ),
    shape('ovule', YELLOW, [500, 560], [ellipse(500, 560, 38, 55), stroke(10, 500, 612, 500, 662)]),
  ],
};

// ── the front of the eye ───────────────────────────────────────────────────
// A section through the front of the eye, the light coming from the left as in the whole eye:
// the cornea bulging out of the sclera, behind it the iris round the pupil, then the lens hung in
// its zonular fibres from the ciliary muscle, the vitreous body behind — cut off on the right,
// where the drawing ends.

/** The middle of the eyeball and of the cornea's curve, on the eye's axis (y 410). */
const GLOBE = [720, 410] as const;
const CORNEA = [530, 410] as const;
const AXIS = 410;
/** The vitreous body: inside the sclera, cut off straight where the drawing ends. */
const vitreous = Array.from({ length: 29 }, (_, i) => {
  const a = ((-140 + i * 10) * Math.PI) / 180;
  return [Math.min(965, GLOBE[0] + 345 * Math.cos(a)), GLOBE[1] + 345 * Math.sin(a)];
}).flat();
const iris = [436, 192, 474, 200, 478, 280, 470, 360, 444, 360, 438, 280];
const ciliary = [470, 176, 520, 134, 600, 94, 652, 86, 636, 132, 596, 176, 545, 198, 492, 200];
const zonule = [
  [532, 196, 546, 254],
  [562, 190, 564, 248],
  [594, 176, 582, 250],
  [622, 156, 600, 256],
];

const eyeFront: SchematicShape = {
  lines: [],
  parts: [
    shape('vitreous', YELLOW, [800, 410], [smooth(...vitreous)]),
    shape(
      'sclera',
      SAND,
      [720, 48],
      [arc(GLOBE[0], GLOBE[1], 345, 380, 220, 314), arc(GLOBE[0], GLOBE[1], 345, 380, 46, 140)],
    ),
    shape('cornea', BLUE, [280, 410], [arc(CORNEA[0], CORNEA[1], 232, 268, 110, 250)]),
    shape('ciliary', PINK, [590, 120], [smooth(...ciliary), smooth(...flip(ciliary, AXIS))]),
    shape(
      'zonule',
      SAND,
      [565, 600],
      zonule.flatMap((z) => [stroke(7, ...z), stroke(7, ...flip(z, AXIS))]),
    ),
    shape('lens', TEAL, [600, 410], [ellipse(565, AXIS, 80, 165)]),
    shape('iris', ORANGE, [456, 260], [smooth(...iris), smooth(...flip(iris, AXIS))]),
    shape('pupil', INK, [455, 410], [box(442, 360, 26, 100)]),
  ],
};

// ── an insect's head ───────────────────────────────────────────────────────
// A bee's head from the front: the compound eyes on either side, the three ocelli on the brow,
// the antennae between the eyes — a short scape, then the bent flagellum — and the mandibles below.

const compoundEye = [
  250, 290, 330, 280, 372, 380, 362, 520, 322, 620, 252, 642, 210, 560, 198, 420,
];
/** The facets of both eyes: a honeycomb of small dots inside each eye's outline. */
const facets = Array.from({ length: 13 }, (_, row) =>
  Array.from({ length: 7 }, (_, k) => [196 + k * 30 + (row % 2) * 15, 300 + row * 26]),
)
  .flat()
  .filter(([x = 0, y = 0]) => ((x - 286) / 62) ** 2 + ((y - 462) / 150) ** 2 < 1)
  .flatMap(([x = 0, y = 0]) => [circle(x, y, 5), circle(1000 - x, y, 5)]);
const antenna = curve(445, 420, 420, 330, 400, 260, 340, 190, 260, 130, 190, 100);
const mandible = [418, 712, 476, 730, 494, 790, 470, 850, 430, 868, 448, 812, 410, 770];

const insectHead: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'head',
      YELLOW,
      [500, 590],
      [
        smooth(
          ...[
            500, 200, 680, 228, 800, 350, 810, 520, 742, 680, 620, 768, 500, 792, 380, 768, 258,
            680, 190, 520, 200, 350, 320, 228,
          ],
        ),
      ],
    ),
    shape('eye', TEAL, [290, 460], [smooth(...compoundEye), smooth(...mirror(compoundEye))]),
    shape(
      'ocelli',
      ORANGE,
      [500, 330],
      [circle(500, 290, 22), circle(456, 354, 20), circle(544, 354, 20)],
    ),
    shape(
      'antenna',
      SAND,
      [340, 190],
      [
        stroke(22, ...antenna),
        stroke(22, ...mirror(antenna)),
        circle(445, 420, 20),
        circle(555, 420, 20),
      ],
    ),
    shape('mandible', ORANGE, [452, 800], [smooth(...mandible), smooth(...mirror(mandible))]),
  ],
  marks: { white: facets },
};

/** The drawings that show a small thing large, by name. */
export const SCHEMATIC_DETAIL = {
  flower_section: flowerSection,
  eye_front: eyeFront,
  insect_head: insectHead,
} as const;
