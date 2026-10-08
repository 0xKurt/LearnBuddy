// The body in the picture library (issue #252, second part): the heart, the ear, the skeleton and
// the organs, each as a schoolbook shows it. Drawn by hand like every drawing of the library
// (`schematicShapes.data.ts` says how); the parts stand in the order of their names.

import {
  band,
  both,
  box,
  circle,
  curve,
  ellipse,
  mirror,
  poly,
  shape,
  smooth,
  stroke,
  TONE,
} from './drawShapes.js';
import type { SchematicShape } from './schematics.js';

const { LILAC, BLUE, GREEN, ORANGE, PINK, YELLOW, SAND, TEAL } = TONE;

// ── the heart ──────────────────────────────────────────────────────────────
// A section seen from the front: the right heart (blue, the blood from the body) on the left of the
// picture, the left heart (red) on the right; the vessels where they leave and enter, the valves
// between atrium and chamber, the muscle around all of it.

const rightAtrium = smooth(
  ...[270, 345, 330, 312, 395, 318, 422, 370, 420, 450, 395, 495, 330, 500, 278, 470, 258, 405],
);
const rightVentricle = smooth(
  ...[300, 528, 380, 522, 455, 530, 462, 610, 445, 700, 405, 770, 355, 715, 315, 640, 290, 575],
);
const leftAtrium = smooth(
  ...[625, 345, 700, 318, 780, 330, 815, 390, 805, 460, 755, 498, 680, 503, 628, 470, 612, 405],
);
const leftVentricle = smooth(
  ...[
    560, 528, 670, 520, 775, 530, 790, 615, 752, 715, 680, 795, 615, 832, 572, 785, 552, 690, 548,
    600,
  ],
);
const heartMuscle = band(
  smooth(
    ...[
      240, 330, 300, 282, 390, 276, 450, 300, 520, 302, 600, 290, 700, 274, 795, 300, 848, 390, 850,
      520, 812, 650, 735, 775, 640, 860, 570, 880, 505, 840, 405, 770, 305, 660, 245, 540, 225, 425,
    ],
  ),
  rightAtrium,
  rightVentricle,
  leftAtrium,
  leftVentricle,
);
const septum = poly(
  ...[
    486, 300, 544, 300, 556, 530, 556, 690, 585, 790, 532, 835, 430, 760, 452, 690, 466, 560, 474,
    420,
  ],
);
const venaCava = [
  stroke(62, 300, 60, 300, 360),
  stroke(58, ...curve(285, 450, 236, 560, 222, 680, 222, 790)),
];
const pulmonaryVeins = [
  stroke(42, 790, 380, 900, 350, 960, 352),
  stroke(42, 795, 445, 905, 470, 962, 470),
];
const aorta = [
  stroke(
    62,
    ...curve(...[575, 560, 575, 330, 580, 170, 620, 95, 690, 70, 770, 95, 810, 175, 812, 268]),
  ),
  stroke(22, 625, 100, 615, 22),
  stroke(22, 680, 75, 680, 8),
  stroke(22, 735, 85, 750, 18),
];
const pulmonaryArtery = [
  stroke(58, ...curve(...[445, 560, 460, 380, 470, 270, 510, 215, 600, 200, 690, 205, 742, 228])),
  stroke(40, ...curve(478, 252, 430, 215, 375, 205)),
];
const valves = [
  poly(332, 500, 356, 500, 366, 580),
  poly(392, 500, 416, 500, 396, 580),
  poly(668, 503, 692, 503, 702, 585),
  poly(728, 503, 752, 503, 730, 585),
];

const heart: SchematicShape = {
  lines: [],
  parts: [
    shape('myocardium', ORANGE, [600, 852], heartMuscle),
    shape('septum', SAND, [508, 640], [septum]),
    shape('vena_cava', BLUE, [300, 130], venaCava),
    shape('pulmonary_vein', PINK, [890, 352], pulmonaryVeins),
    shape('aorta', PINK, [690, 72], aorta),
    shape('pulmonary_artery', BLUE, [468, 300], pulmonaryArtery),
    shape('right_atrium', BLUE, [320, 412], [rightAtrium]),
    shape('left_atrium', PINK, [712, 405], [leftAtrium]),
    shape('right_ventricle', BLUE, [372, 676], [rightVentricle]),
    shape('left_ventricle', PINK, [668, 690], [leftVentricle]),
    shape('valve', YELLOW, [694, 548], valves),
  ],
};

// ── the ear ────────────────────────────────────────────────────────────────
// A section from the outer to the inner ear, the middle ear larger than life (as the schoolbook
// draws it), so that its parts can be told apart: the canal ends at the eardrum, the three ossicles
// bridge the middle ear to the inner ear, the tube leads down to the throat.

/** The groove of the cochlea: a spiral of two and a half turns around (cx, cy). */
const spiral = (cx: number, cy: number, r0: number, r1: number) =>
  Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * 5 * Math.PI;
    const r = r0 + ((r1 - r0) * i) / 40;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }).flat();

const middleEar = smooth(
  ...[400, 300, 440, 245, 530, 232, 600, 262, 615, 350, 600, 440, 545, 490, 460, 478, 405, 430],
);
const pinna = [
  stroke(
    54,
    ...curve(
      ...[205, 318, 192, 190, 140, 105, 80, 100, 50, 170, 58, 290, 50, 400, 70, 500, 120, 575],
    ),
  ),
  smooth(...[70, 480, 120, 470, 175, 520, 180, 575, 140, 610, 92, 590, 66, 540]),
  smooth(150, 300, 205, 290, 210, 440, 160, 440, 132, 380),
];
const ossicles = [
  stroke(14, 398, 398, 442, 318),
  ellipse(452, 300, 24, 30, 20),
  ellipse(500, 292, 26, 21),
  stroke(14, 508, 300, 526, 362),
  ...band(poly(522, 352, 598, 330, 598, 384), poly(538, 354, 588, 341, 588, 372)),
];
const semicircularCanals = [
  ellipse(640, 330, 46, 40),
  ...band(ellipse(668, 205, 62, 56), ellipse(668, 205, 38, 32)),
  ...band(ellipse(735, 262, 58, 44, 35), ellipse(735, 262, 36, 22, 35)),
  ...band(ellipse(620, 262, 44, 58, -15), ellipse(620, 262, 22, 36, -15)),
];
const nerve = [
  stroke(30, ...curve(705, 285, 800, 300, 900, 322, 975, 330)),
  stroke(34, ...curve(800, 410, 860, 350, 905, 330)),
];

const ear: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'eustachian_tube',
      GREEN,
      [662, 590],
      [stroke(44, ...curve(540, 440, 600, 530, 690, 610, 800, 670))],
    ),
    shape('middle_ear', YELLOW, [545, 468], [middleEar]),
    shape('pinna', PINK, [62, 300], pinna),
    shape('canal', ORANGE, [252, 362], [stroke(66, ...curve(195, 365, 290, 358, 390, 372))]),
    shape('eardrum', BLUE, [387, 415], [ellipse(392, 372, 12, 72, 10)]),
    shape('ossicles', SAND, [500, 292], ossicles),
    shape('canals', LILAC, [672, 165], semicircularCanals),
    shape(
      'cochlea',
      TEAL,
      [775, 470],
      band(circle(760, 425, 88), stroke(9, ...spiral(760, 425, 12, 70))),
    ),
    shape('nerve', YELLOW, [905, 330], nerve),
  ],
};

// ── the skeleton ───────────────────────────────────────────────────────────
// From the front, the arms a little away from the body, the palms forward: the radius on the
// thumb's side, the fibula on the outside of the shin. A bone that comes in pairs is drawn on both
// sides; its number points at one of them.

/** A rib from the breastbone out and down round the side, `w` wide, starting at height `y`. */
const rib = (y: number, w: number) =>
  curve(488, y, 500 - 0.7 * w, y - 6, 500 - w, y + 22, 500 - w + 2, y + 58);
const ribs = [
  [206, 60],
  [226, 82],
  [246, 96],
  [268, 104],
  [290, 106],
  [312, 102],
  [334, 94],
].flatMap(([y = 0, w = 0]) => [stroke(12, ...rib(y, w)), stroke(12, ...mirror(rib(y, w)))]);
const pelvis = band(
  smooth(
    ...[
      500, 455, 440, 436, 385, 440, 362, 476, 378, 522, 420, 566, 462, 586, 500, 576, 538, 586, 580,
      566, 622, 522, 638, 476, 615, 440, 560, 436,
    ],
  ),
  ellipse(500, 512, 46, 30),
  ellipse(452, 558, 16, 12, -20),
  ellipse(548, 558, 16, 12, 20),
);
const skull = [
  ...band(
    smooth(...[500, 18, 550, 32, 564, 80, 552, 120, 448, 120, 436, 80, 450, 32]),
    ellipse(477, 82, 16, 14),
    ellipse(523, 82, 16, 14),
    poly(500, 94, 510, 112, 490, 112),
  ),
  smooth(458, 114, 542, 114, 536, 140, 500, 154, 464, 140),
];
const leftHand = [
  [8, 304, 570, 296, 612, 292, 640],
  [8, 310, 572, 307, 616, 306, 646],
  [8, 317, 571, 318, 614, 320, 642],
  [7, 323, 567, 330, 604, 334, 630],
  [8, 299, 562, 284, 586, 276, 608],
];
const hands = [
  ...leftHand.flatMap(([w = 0, ...xy]) => both(w, ...xy)),
  ellipse(313, 566, 15, 11),
  ellipse(687, 566, 15, 11),
];
const leftFoot = [432, 972, 466, 970, 482, 988, 474, 1010, 438, 1014, 416, 998];

const skeleton: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'spine',
      YELLOW,
      [500, 446],
      Array.from({ length: 18 }, (_, i) => box(487, 152 + i * 22, 26, 17, 6)),
    ),
    shape('pelvis', ORANGE, [436, 574], pelvis),
    shape('ribcage', SAND, [601, 350], ribs),
    shape(
      'sternum',
      SAND,
      [500, 215],
      [smooth(...[488, 194, 512, 194, 516, 270, 508, 322, 500, 334, 492, 322, 484, 270])],
    ),
    shape('skull', SAND, [500, 52], skull),
    shape('collarbone', YELLOW, [442, 181], both(14, 487, 190, 440, 180, 398, 186)),
    shape(
      'humerus',
      SAND,
      [360, 335],
      [...both(22, 388, 204, 346, 396), circle(390, 198, 16), circle(610, 198, 16)],
    ),
    shape('radius', TEAL, [320, 484], both(10, 336, 412, 304, 556)),
    shape('ulna', TEAL, [663, 484], both(10, 352, 410, 322, 558)),
    shape('hand', YELLOW, [707, 636], hands),
    shape(
      'femur',
      SAND,
      [561, 640],
      [...both(28, 432, 548, 446, 742), circle(426, 540, 20), circle(574, 540, 20)],
    ),
    shape('kneecap', TEAL, [447, 752], [ellipse(447, 752, 15, 18), ellipse(553, 752, 15, 18)]),
    shape('tibia', SAND, [551, 870], both(24, 446, 770, 452, 970)),
    shape('fibula', SAND, [524, 870], both(10, 474, 776, 478, 962)),
    shape('foot', YELLOW, [450, 992], [smooth(...leftFoot), smooth(...mirror(leftFoot))]),
  ],
};

// ── the organs ─────────────────────────────────────────────────────────────
// The trunk from the front, its outline a thin line, the organs where a schoolbook puts them: the
// liver under the right lung (left in the picture), the stomach under the left one, the small
// intestine coiled in the frame of the large intestine, the kidneys at the back beside it.

const silhouette = [
  curve(
    ...[
      465, 205, 462, 172, 438, 150, 422, 95, 445, 35, 500, 14, 555, 35, 578, 95, 562, 150, 538, 172,
      535, 205,
    ],
  ),
  curve(
    ...[
      465, 205, 420, 218, 335, 236, 295, 290, 288, 430, 300, 560, 318, 660, 296, 790, 318, 900, 420,
      975, 500, 988, 580, 975, 682, 900, 704, 790, 682, 660, 700, 560, 712, 430, 705, 290, 665, 236,
      580, 218, 535, 205,
    ],
  ),
].map((xy) => xy.map(Math.round).join(' '));
const kidney = [352, 645, 378, 650, 384, 690, 372, 735, 345, 742, 326, 705, 330, 660];
const largeIntestine = curve(
  ...[
    400, 905, 388, 800, 392, 690, 450, 668, 550, 668, 610, 690, 640, 780, 640, 870, 600, 920, 545,
    935,
  ],
);
const smallIntestine = curve(
  ...[
    440, 718, 560, 714, 584, 736, 560, 756, 440, 756, 418, 776, 440, 796, 560, 796, 584, 816, 560,
    836, 440, 836, 418, 856, 440, 876, 560, 876,
  ],
);
const leftLung = [
  470, 240, 430, 238, 385, 270, 355, 340, 345, 430, 355, 495, 410, 500, 462, 482, 478, 400, 480,
  300,
];
const rightLung = [
  530, 240, 570, 238, 615, 270, 645, 340, 655, 430, 645, 495, 600, 500, 575, 470, 560, 445, 525,
  420, 520, 300,
];
const trachea = [
  ...band(
    stroke(26, 500, 176, 500, 300),
    ...[190, 212, 234, 256, 278].map((y) => box(492, y, 16, 5)),
  ),
  stroke(18, 500, 296, 466, 334),
  stroke(18, 500, 296, 534, 334),
];
/** A fold of the brain: a wave over the left half, and its mirror image. */
const fold = (y: number) => [
  stroke(6, ...curve(446, y, 458, y - 8, 472, y + 2, 486, y - 6)),
  stroke(6, ...mirror(curve(446, y, 458, y - 8, 472, y + 2, 486, y - 6))),
];
const brain = band(
  smooth(...[500, 30, 548, 40, 572, 80, 562, 120, 530, 138, 470, 138, 438, 120, 428, 80, 452, 40]),
  stroke(6, 500, 46, 500, 130),
  ...[66, 94, 120].flatMap(fold),
);

const organs: SchematicShape = {
  lines: silhouette,
  parts: [
    shape('kidneys', LILAC, [342, 694], [smooth(...kidney), smooth(...mirror(kidney))]),
    shape('large_intestine', TEAL, [642, 820], [stroke(46, ...largeIntestine)]),
    shape('small_intestine', GREEN, [492, 794], [stroke(30, ...smallIntestine)]),
    shape(
      'bladder',
      BLUE,
      [500, 952],
      [smooth(460, 935, 500, 922, 540, 935, 548, 960, 520, 980, 480, 980, 452, 960)],
    ),
    shape(
      'liver',
      SAND,
      [430, 540],
      [
        smooth(
          ...[
            345, 505, 420, 490, 520, 492, 600, 505, 610, 530, 560, 560, 470, 590, 400, 605, 355,
            580,
          ],
        ),
      ],
    ),
    shape(
      'stomach',
      YELLOW,
      [632, 562],
      [
        smooth(
          ...[
            580, 505, 640, 490, 685, 525, 688, 590, 650, 635, 585, 645, 552, 622, 575, 598, 625,
            580, 622, 535,
          ],
        ),
      ],
    ),
    shape('lungs', PINK, [395, 370], [smooth(...leftLung), smooth(...rightLung)]),
    shape('trachea', BLUE, [500, 222], trachea),
    shape(
      'heart',
      ORANGE,
      [548, 420],
      [smooth(500, 370, 545, 355, 590, 380, 600, 430, 570, 480, 530, 502, 500, 470, 485, 420)],
    ),
    shape('brain', LILAC, [500, 70], brain),
  ],
};

/** The drawings of the body, by name. */
export const SCHEMATIC_BODY = { heart, ear, skeleton, organs } as const;
