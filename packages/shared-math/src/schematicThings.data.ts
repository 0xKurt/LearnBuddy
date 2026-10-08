// Things in the picture library (issue #252, second part): the microscope, the lab equipment, the
// traffic signs, the musical instruments and the pictures of an Anlaut chart. Drawn by hand like
// every drawing of the library (`schematicShapes.data.ts` says how). A set of things stands in two
// columns, so that every number reaches its thing from the side without crossing another; what is
// drawn on a thing without being a part — a sign's white symbol, a fish's eye — is a mark.

import {
  band,
  box,
  circle,
  curve,
  ellipse,
  moon,
  poly,
  shape,
  smooth,
  stroke,
  TONE,
} from './drawShapes.js';
import type { SchematicShape } from './schematics.js';

const { LILAC, BLUE, GREEN, ORANGE, PINK, YELLOW, SAND, TEAL } = TONE;

// ── the microscope ─────────────────────────────────────────────────────────
// From the side, as in every biology book: the light rises from the lamp in the foot through the
// diaphragm, the stage, the objective and the tube to the eyepiece; the arm carries it all.

const microscope: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'arm',
      TEAL,
      [652, 420],
      [
        stroke(
          78,
          ...curve(...[690, 900, 700, 760, 690, 620, 660, 470, 610, 340, 530, 262, 440, 246]),
        ),
      ],
    ),
    shape('foot', SAND, [560, 905], [box(250, 870, 530, 66, 26)]),
    shape('light', YELLOW, [404, 832], [smooth(350, 872, 356, 812, 404, 788, 452, 812, 458, 872)]),
    shape('stage', BLUE, [580, 575], [box(240, 560, 470, 30, 6), stroke(10, 290, 556, 352, 548)]),
    shape('diaphragm', ORANGE, [404, 612], [box(340, 600, 128, 24, 6)]),
    shape('tube', GREEN, [404, 268], [box(372, 140, 64, 250, 8)]),
    shape(
      'revolver',
      PINK,
      [462, 402],
      [smooth(330, 394, 404, 378, 478, 394, 470, 420, 404, 432, 338, 420)],
    ),
    shape(
      'objective',
      LILAC,
      [334, 466],
      [box(386, 424, 36, 88, 8), stroke(30, 362, 420, 330, 482), stroke(30, 446, 420, 478, 482)],
    ),
    shape('eyepiece', ORANGE, [404, 100], [box(382, 60, 44, 90, 6), box(368, 44, 72, 24, 10)]),
    shape('coarse_focus', YELLOW, [702, 640], [circle(702, 640, 50)]),
    shape('fine_focus', YELLOW, [700, 790], [circle(700, 790, 32)]),
  ],
};

// ── the lab ────────────────────────────────────────────────────────────────

/** Marks of a scale on glass, `w` wide from x, at the heights `ys`: cut out of the glass. */
const scale = (x: number, w: number, ys: readonly number[]) => ys.map((y) => box(x, y, w, 5));

const lab: SchematicShape = {
  lines: [],
  parts: [
    shape('test_tube', BLUE, [240, 150], [box(228, 34, 44, 225, 22), box(220, 28, 60, 14, 6)]),
    shape(
      'beaker',
      TEAL,
      [812, 150],
      band(
        poly(662, 62, 838, 62, 826, 252, 674, 252, 662, 70, 648, 52),
        ...scale(690, 34, [110, 150, 190]),
      ),
    ),
    shape(
      'erlenmeyer',
      LILAC,
      [196, 476],
      [poly(228, 302, 272, 302, 272, 392, 350, 522, 150, 522, 228, 392), box(220, 292, 60, 14, 6)],
    ),
    shape(
      'round_flask',
      PINK,
      [804, 456],
      [box(730, 300, 40, 112, 6), box(722, 292, 56, 14, 6), circle(750, 456, 80)],
    ),
    shape(
      'cylinder',
      GREEN,
      [238, 690],
      [
        ...band(box(222, 560, 56, 222, 8), ...scale(234, 22, [600, 640, 680, 720])),
        box(186, 772, 128, 22, 8),
      ],
    ),
    shape(
      'funnel',
      ORANGE,
      [806, 604],
      [poly(660, 578, 840, 578, 766, 694, 766, 800, 734, 800, 734, 694)],
    ),
    shape(
      'burner',
      YELLOW,
      [180, 1022],
      [
        smooth(176, 1036, 186, 1008, 250, 998, 314, 1008, 324, 1036),
        box(234, 884, 32, 120, 4),
        box(228, 968, 44, 18, 4),
        stroke(12, 300, 1012, 352, 1004),
        smooth(250, 812, 266, 846, 262, 872, 250, 880, 238, 872, 234, 846),
      ],
    ),
    shape(
      'tripod',
      SAND,
      [858, 980],
      [
        ...band(ellipse(750, 880, 104, 24), ellipse(750, 880, 86, 13)),
        stroke(14, 652, 886, 632, 1036),
        stroke(14, 848, 886, 868, 1036),
        stroke(12, 734, 902, 728, 1018),
      ],
    ),
  ],
};

// ── traffic ────────────────────────────────────────────────────────────────
// The signs of the cycling test, each with its white symbol — and the black walker of the crossing
// — as marks on the sign: a tap on the symbol means the sign.

/** A regular polygon around (cx, cy), one corner pointing at `deg`. */
const regular = (cx: number, cy: number, r: number, n: number, deg = 0) =>
  poly(
    ...Array.from({ length: n }, (_, i) => {
      const a = ((deg + (i * 360) / n) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }).flat(),
  );

/** STOP in its white ring, on the octagon around (250, 150). */
const stopLetters = [
  ...band(regular(250, 150, 108, 8, 22.5), regular(250, 150, 98, 8, 22.5)),
  stroke(
    11,
    ...curve(
      ...[203, 130, 188, 122, 172, 128, 171, 142, 187, 150, 202, 158, 205, 172, 190, 180, 171, 175],
    ),
  ),
  poly(213, 120, 249, 120, 249, 131, 236, 131, 236, 181, 226, 181, 226, 131, 213, 131),
  ...band(ellipse(272, 151, 17, 30), ellipse(272, 151, 7, 19)),
  stroke(11, 300, 121, 300, 181),
  ...band(
    smooth(296, 120, 318, 120, 333, 135, 318, 152, 296, 152),
    smooth(305, 130, 316, 130, 322, 136, 316, 142, 305, 142),
  ),
];
/** The white bicycle on the cycle path's sign around (250, 750). */
const bicycleSymbol = [
  ...band(circle(205, 778, 32), circle(205, 778, 23)),
  ...band(circle(295, 778, 32), circle(295, 778, 23)),
  stroke(9, 205, 778, 245, 778, 230, 738, 205, 778),
  stroke(9, 230, 738, 280, 740, 245, 778),
  stroke(9, 295, 778, 278, 722, 266, 718),
  stroke(9, 220, 732, 242, 732),
];
/** The walker on the zebra crossing, black on the white triangle around (750, 450). */
const walker = [
  circle(744, 406, 12),
  stroke(13, 745, 422, 752, 464),
  stroke(10, 752, 462, 736, 498, 724, 503),
  stroke(10, 752, 462, 772, 486, 786, 496),
  stroke(8, 747, 432, 728, 454),
  stroke(8, 749, 432, 770, 448),
  ...[682, 714, 746, 778, 810].map((x) => box(x, 512, 20, 10)),
];

const signs: SchematicShape = {
  lines: [],
  parts: [
    shape('stop', PINK, [170, 150], [regular(250, 150, 118, 8, 22.5)]),
    shape('give_way', PINK, [750, 92], [poly(630, 58, 870, 58, 750, 266)]),
    shape('priority_road', YELLOW, [170, 450], [regular(250, 450, 120, 4, 90)]),
    shape('crossing', BLUE, [846, 450], [box(635, 335, 230, 230, 16)]),
    shape('cycle_path', BLUE, [170, 750], [circle(250, 750, 115)]),
    shape('one_way', BLUE, [850, 750], [box(625, 705, 250, 90, 10)]),
  ],
  marks: {
    white: [
      ...stopLetters,
      poly(668, 80, 832, 80, 750, 222),
      ...band(regular(250, 450, 108, 4, 90), regular(250, 450, 82, 4, 90)),
      poly(750, 356, 850, 534, 650, 534),
      ...bicycleSymbol,
      poly(650, 742, 822, 742, 822, 722, 868, 750, 822, 778, 822, 758, 650, 758),
    ],
    black: walker,
  },
};

// ── music ──────────────────────────────────────────────────────────────────

const guitarBody = smooth(
  ...[
    70, 160, 85, 100, 140, 82, 190, 104, 222, 110, 262, 108, 292, 130, 300, 160, 292, 190, 262, 212,
    222, 210, 190, 216, 140, 238, 85, 220,
  ],
);
const trumpet = [
  stroke(18, 572, 450, 888, 450),
  stroke(14, ...curve(660, 450, 652, 500, 700, 514, 800, 514, 838, 490, 840, 456)),
  poly(882, 432, 958, 392, 958, 508, 882, 468),
  box(552, 438, 24, 24, 6),
  ...[700, 732, 764].map((x) => box(x, 408, 18, 44, 4)),
];
const xylophone = [
  stroke(14, 548, 652, 946, 700),
  stroke(14, 548, 804, 946, 788),
  ...Array.from({ length: 7 }, (_, i) => box(566 + i * 54, 612 + i * 12, 40, 228 - i * 24, 6)),
  stroke(8, 640, 600, 720, 560),
  circle(632, 604, 14),
];

const instruments: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'guitar',
      ORANGE,
      [100, 160],
      [guitarBody, box(290, 149, 164, 22, 4), box(450, 140, 44, 40, 8)],
    ),
    shape(
      'recorder',
      SAND,
      [902, 160],
      [
        stroke(30, 548, 160, 930, 160),
        poly(528, 150, 560, 145, 560, 175, 536, 170),
        poly(920, 145, 958, 136, 958, 184, 920, 175),
      ],
    ),
    shape(
      'drum',
      PINK,
      [150, 440],
      [
        box(130, 375, 240, 125, 14),
        ellipse(250, 375, 120, 30),
        stroke(10, 310, 350, 400, 290),
        stroke(10, 335, 362, 430, 318),
      ],
    ),
    shape('trumpet', YELLOW, [922, 450], trumpet),
    shape(
      'triangle',
      TEAL,
      [168, 740],
      [stroke(16, 234, 600, 140, 782, 362, 782, 262, 596), stroke(8, 318, 640, 420, 596)],
    ),
    shape('xylophone', LILAC, [918, 718], xylophone),
  ],
  marks: {
    black: [
      // The guitar's sound hole, bridge and strings; the recorder's holes; the drum's cords and rim.
      circle(190, 160, 22),
      box(102, 150, 14, 20, 3),
      ...[152, 160, 168].map((y) => stroke(2, 108, y, 452, y)),
      ...[640, 690, 740, 790, 840].map((x) => circle(x, 160, 6)),
      stroke(4, 132, 400, 170, 490, 210, 400, 250, 490, 290, 400, 330, 490, 368, 400),
      stroke(3, ...curve(131, 378, 190, 400, 250, 405, 310, 400, 369, 378)),
    ],
  },
};

// ── initial sounds ─────────────────────────────────────────────────────────
// Eight pictures of an Anlaut chart, each with its own first sound.

const apple = [
  smooth(
    ...[
      250, 88, 285, 72, 325, 92, 340, 138, 325, 186, 290, 212, 250, 202, 210, 212, 175, 186, 160,
      138, 175, 92, 215, 72,
    ],
  ),
  stroke(10, 250, 92, 258, 48),
  smooth(264, 64, 292, 46, 318, 52, 292, 70),
];
const sun = [
  circle(750, 390, 60),
  ...Array.from({ length: 8 }, (_, i) => {
    const [c, s] = [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)];
    return stroke(16, 750 + 74 * c, 390 + 74 * s, 750 + 104 * c, 390 + 104 * s);
  }),
];
const fish = [
  ellipse(740, 650, 96, 56),
  poly(820, 650, 892, 598, 878, 650, 892, 702),
  poly(706, 598, 752, 568, 770, 600),
];
const clockTicks = Array.from({ length: 12 }, (_, i) => {
  const [c, s] = [Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6)];
  return stroke(5, 750 + 58 * c, 910 + 58 * s, 750 + 66 * c, 910 + 66 * s);
});

const anlaut: SchematicShape = {
  lines: [],
  parts: [
    shape('apple', PINK, [190, 140], apple),
    shape('ball', BLUE, [800, 160], [circle(750, 130, 86)]),
    shape(
      'house',
      SAND,
      [196, 470],
      [box(170, 385, 160, 112), poly(146, 392, 250, 296, 354, 392), box(296, 316, 22, 44)],
    ),
    shape('sun', YELLOW, [812, 390], sun),
    shape('moon', YELLOW, [196, 650], [moon(250, 650, 92)]),
    shape('fish', TEAL, [812, 650], fish),
    shape(
      'ice_cream',
      ORANGE,
      [196, 900],
      [poly(204, 900, 296, 900, 250, 1030), circle(250, 870, 50)],
    ),
    shape(
      'clock',
      LILAC,
      [812, 910],
      [circle(750, 910, 86), circle(690, 838, 22), circle(810, 838, 22)],
    ),
  ],
  marks: {
    white: [
      // The ball's stripes, the house's windows and door, the clock's face, the cone's wafer.
      stroke(14, ...curve(722, 50, 700, 130, 722, 210)),
      stroke(14, ...curve(778, 50, 800, 130, 778, 210)),
      box(186, 408, 36, 34, 4),
      box(278, 408, 36, 34, 4),
      box(232, 440, 36, 57, 4),
      circle(750, 910, 70),
      stroke(4, 212, 912, 268, 968),
      stroke(4, 288, 912, 232, 968),
      stroke(4, 238, 904, 280, 946),
      stroke(4, 262, 904, 220, 946),
    ],
    black: [
      // The fish's eye and gill, the clock's hands and hours.
      circle(690, 638, 9),
      stroke(5, ...curve(770, 612, 782, 650, 770, 688)),
      stroke(8, 750, 910, 750, 860),
      stroke(8, 750, 910, 792, 930),
      circle(750, 910, 8),
      ...clockTicks,
    ],
  },
};

/** The things, by name. */
export const SCHEMATIC_THINGS = { microscope, lab, signs, instruments, anlaut } as const;
