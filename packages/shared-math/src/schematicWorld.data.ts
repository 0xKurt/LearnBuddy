// The picture library's drawings of the non-living world (issue #462): the set-up a chemistry
// class labels first (a distillation), the earth's layers and a volcano, the compass rose, a
// thermometer, the phases of the moon and a primary school circuit. Drawn by hand like every
// drawing of the library (`schematicShapes.data.ts` says how); the parts stand in the order of
// their names (`schematicWorldNames.data.ts`). Glass stands open where a schoolbook draws it so:
// what flows through it is drawn in front of it.

import {
  arc,
  band,
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

const { BLUE, GREEN, LILAC, ORANGE, PINK, SAND, TEAL, YELLOW } = TONE;

/** A burner standing at x on the table at `y`: its foot, its tube and its flame. */
const burner = (x: number, y: number) => [
  smooth(x - 70, y, x - 60, y - 26, x, y - 36, x + 60, y - 26, x + 70, y),
  box(x - 15, y - 150, 30, 120, 4),
  box(x - 22, y - 70, 44, 16, 4),
  smooth(
    x,
    y - 222,
    x + 16,
    y - 190,
    x + 12,
    y - 166,
    x,
    y - 158,
    x - 12,
    y - 166,
    x - 16,
    y - 190,
  ),
];
/** A stand on the table at `y`: its foot from x0 to x1 and its rod at `rod` up to `top`. */
const stand = (x0: number, x1: number, y: number, rod: number, top: number) => [
  box(x0, y, x1 - x0, 24, 8),
  stroke(22, rod, y + 4, rod, top),
  circle(rod, top, 14),
];

// ── distillation ───────────────────────────────────────────────────────────
// The set-up of every chemistry book: the round-bottom flask on the stand over the burner, the
// thermometer's bulb at the side arm, the Liebig condenser sloping down — its cooling water in at
// the lower end and out at the upper one, against the vapour — and the receiver with the distillate.

/** The condenser's axis, from the side arm down to the receiver. */
const COND = [370, 372, 740, 548] as const;

const distillation: SchematicShape = {
  lines: ['20 816 980 816'],
  parts: [
    shape(
      'stand',
      SAND,
      [80, 520],
      [
        ...stand(30, 330, 792, 80, 150),
        stroke(12, 80, 330, 226, 330),
        box(220, 316, 12, 32, 4),
        box(268, 316, 12, 32, 4),
      ],
    ),
    shape('burner', YELLOW, [250, 700], burner(250, 792)),
    shape(
      'receiver',
      TEAL,
      [880, 625],
      [poly(740, 590, 940, 590, 932, 816, 748, 816, 740, 598, 728, 580)],
    ),
    shape('distillate', BLUE, [840, 750], [poly(743, 676, 937, 676, 932, 816, 748, 816)]),
    shape(
      'round_flask',
      PINK,
      [210, 445],
      [
        circle(250, 470, 100),
        box(232, 290, 36, 100, 4),
        box(222, 274, 56, 30, 6),
        stroke(16, 266, 326, 362, 366),
      ],
    ),
    shape(
      'boiling_chips',
      SAND,
      [250, 548],
      [circle(222, 548, 10), circle(250, 554, 10), circle(278, 547, 10)],
    ),
    shape('thermometer', LILAC, [250, 180], [box(243, 100, 14, 240, 6), circle(250, 344, 13)]),
    shape(
      'condenser',
      GREEN,
      [555, 460],
      [
        stroke(64, ...COND),
        stroke(16, 340, 358, COND[0], COND[1]),
        stroke(16, COND[2], COND[3], 818, 585, 824, 660),
      ],
    ),
    shape('water_in', BLUE, [676, 625], [stroke(22, 676, 540, 676, 664)]),
    shape('water_out', BLUE, [434, 295], [stroke(22, 434, 380, 434, 268)]),
  ],
};

// ── the earth ──────────────────────────────────────────────────────────────
// The layers in their proportions (the core half the radius, the inner core a fifth), only the
// crust thicker than true — a thin line would be no part to point at.

const earth: SchematicShape = {
  lines: [],
  parts: [
    shape('crust', SAND, [500, 45], [...band(circle(500, 500, 470), circle(500, 500, 440))]),
    shape('mantle', ORANGE, [760, 260], [...band(circle(500, 500, 440), circle(500, 500, 258))]),
    shape('outer_core', YELLOW, [500, 325], [...band(circle(500, 500, 258), circle(500, 500, 92))]),
    shape('inner_core', PINK, [500, 500], [circle(500, 500, 92)]),
  ],
};

// ── a volcano ──────────────────────────────────────────────────────────────
// A stratovolcano in section: the cone of ash and lava in layers over the magma chamber, the vent
// up to the crater, a side vent to a second cone on the flank, lava running down the other flank
// and the ash cloud over it.

const cone = [100, 760, 300, 520, 420, 330, 470, 300, 530, 300, 580, 330, 700, 520, 900, 760];
/** The side vent's course, straightened: the layers it breaks through stop on either side of it. */
const SIDE = [492, 690, 330, 476] as const;
/** The segment a→b without the stretch `gap` either side of where it crosses the side vent. */
function broken(a: readonly [number, number], b: readonly [number, number], gap: number) {
  const [cx, cy, dx, dy] = [SIDE[0], SIDE[1], SIDE[2] - SIDE[0], SIDE[3] - SIDE[1]];
  const [ex, ey] = [b[0] - a[0], b[1] - a[1]];
  const det = ex * dy - ey * dx;
  const t = ((cx - a[0]) * dy - (cy - a[1]) * dx) / det;
  const g = gap / Math.hypot(ex, ey);
  const at = (k: number) => [a[0] + k * ex, a[1] + k * ey];
  return t - g > 0 && t + g < 1
    ? [
        [...a, ...at(t - g)],
        [...at(t + g), ...b],
      ]
    : [[...a, ...b]];
}
/** The layers of the cone: its left flank `d` lower, out to the vent, and the same on the right. */
const strata = [70, 150, 230, 310].flatMap((d) => {
  const left = [100 + 0.744 * d, 760, 476, 252 + d] as const;
  return [
    ...broken([left[0], left[1]], [left[2], left[3]], 34).map((xy) => stroke(4, ...xy)),
    stroke(4, ...mirror(left)),
  ];
});

const volcano: SchematicShape = {
  lines: ['20 760 100 760', '900 760 980 760'],
  parts: [
    shape('magma_chamber', PINK, [500, 905], [ellipse(500, 900, 270, 72)]),
    shape('layers', SAND, [760, 680], [poly(...cone)]),
    shape('vent', ORANGE, [500, 470], [stroke(44, 500, 860, 500, 318)]),
    shape(
      'side_vent',
      ORANGE,
      [380, 560],
      [stroke(30, ...curve(492, 690, 430, 620, 370, 540, 330, 476))],
    ),
    shape('crater', YELLOW, [500, 318], [poly(440, 300, 560, 300, 530, 338, 470, 338)]),
    shape(
      'lava',
      ORANGE,
      [650, 425],
      [stroke(34, ...curve(575, 315, 610, 362, 650, 425, 695, 512, 760, 594, 800, 642))],
    ),
    shape(
      'ash_cloud',
      LILAC,
      [500, 130],
      [
        smooth(
          ...[
            470, 290, 400, 250, 330, 230, 300, 170, 350, 110, 420, 100, 470, 50, 560, 40, 620, 90,
            690, 100, 730, 160, 690, 220, 610, 240, 540, 290,
          ],
        ),
      ],
    ),
  ],
  marks: { black: strata },
};

// ── the compass rose ───────────────────────────────────────────────────────
// Eight points round a centre, north up as on every map: the four main points long, the four
// between them short and behind; north in its own colour like a compass needle. No letters — naming
// the directions is the task.

/**
 * A point of the rose: a kite from the centre out to `len` at `deg` (0 = north, clockwise), its
 * sides `side` out on the lines halfway to the next points — so the four main points meet without
 * overlapping and the points between them stand behind.
 */
const point = (deg: number, len: number, side: number) => {
  const at = (d: number, r: number) => {
    const a = ((d - 90) * Math.PI) / 180;
    return [500 + r * Math.cos(a), 500 + r * Math.sin(a)];
  };
  return poly(500, 500, ...at(deg - 45, side), ...at(deg, len), ...at(deg + 45, side));
};
/** Where a point's name belongs: along it, `r` from the centre. */
const along = (deg: number, r: number): [number, number] => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [Math.round(500 + r * Math.cos(a)), Math.round(500 + r * Math.sin(a))];
};
/** The points between first: they stand behind the four main ones. */
const DIRECTIONS = [
  ['northeast', 45],
  ['southeast', 135],
  ['southwest', 225],
  ['northwest', 315],
  ['north', 0],
  ['east', 90],
  ['south', 180],
  ['west', 270],
] as const;

const compass: SchematicShape = {
  lines: [],
  parts: DIRECTIONS.map(([id, deg]) => {
    const main = deg % 90 === 0;
    const tone = deg === 0 ? PINK : main ? BLUE : LILAC;
    return shape(id, tone, along(deg, main ? 280 : 200), [
      point(deg, main ? 470 : 330, main ? 100 : 70),
    ]);
  }),
  marks: { white: [circle(500, 500, 22)] },
};

// ── a thermometer ──────────────────────────────────────────────────────────

const thermometer: SchematicShape = {
  lines: [],
  parts: [
    shape('scale', SAND, [610, 420], [box(330, 30, 340, 880, 34)]),
    shape('capillary', BLUE, [500, 200], [box(475, 70, 50, 740, 25)]),
    shape('liquid', PINK, [500, 600], [box(483, 440, 34, 380, 12)]),
    shape('bulb', PINK, [500, 850], [circle(500, 850, 72)]),
  ],
  marks: {
    // The scale's marks: a long one every fifth.
    black: Array.from({ length: 31 }, (_, i) =>
      box(i % 5 === 0 ? 360 : 385, 100 + i * 22, i % 5 === 0 ? 85 : 60, 6),
    ),
  },
};

// ── the moon ───────────────────────────────────────────────────────────────
// Its four main phases as seen from Germany, in their order: new, first quarter (lit on the right),
// full, last quarter (lit on the left). The moon is the part; its dark side is drawn on it in ink.

const MOON = [
  ['new_moon', 250, 250],
  ['first_quarter', 750, 250],
  ['full_moon', 250, 750],
  ['last_quarter', 750, 750],
] as const;
/** The half of a disk on one side: left (−1) or right (1). */
const half = (cx: number, cy: number, side: number) =>
  arc(cx, cy, 0, 175, side < 0 ? 90 : -90, side < 0 ? 270 : 90);

const moonPhases: SchematicShape = {
  lines: [],
  parts: MOON.map(([id, x, y]) => shape(id, YELLOW, [x, y], [circle(x, y, 175)])),
  marks: {
    black: [circle(250, 250, 175), half(750, 250, -1), half(750, 750, 1)],
  },
};

// ── an electric circuit ────────────────────────────────────────────────────
// The first circuit of primary school as a picture, not as a diagram (that is the circuit figure,
// #261): a battery, a bulb in its holder, a switch, closed, and the wires between them.

const circuit: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'wire',
      ORANGE,
      [150, 450],
      [
        stroke(10, 392, 640, 150, 640, 150, 255, 457, 255),
        stroke(10, 543, 255, 850, 255, 850, 337),
        stroke(10, 850, 478, 850, 640, 612, 640),
      ],
    ),
    shape('battery', BLUE, [470, 640], [box(390, 600, 200, 80, 14), box(588, 618, 24, 44, 6)]),
    shape('holder', SAND, [500, 250], [box(455, 215, 90, 70, 10)]),
    shape('bulb', YELLOW, [500, 85], [circle(500, 110, 90), box(465, 180, 70, 40, 6)]),
    shape('switch', SAND, [850, 410], [box(815, 335, 70, 145, 12)]),
  ],
  marks: {
    white: [
      stroke(6, 548, 640, 572, 640),
      stroke(6, 560, 628, 560, 652),
      stroke(6, 410, 640, 432, 640),
    ],
    black: [
      stroke(4, 480, 172, 486, 112, 500, 98, 514, 112, 520, 172),
      stroke(10, 850, 462, 850, 352),
      circle(850, 352, 10),
      circle(850, 462, 10),
    ],
  },
};

/** The drawings of the world, by name. */
export const SCHEMATIC_WORLD = {
  distillation,
  earth,
  volcano,
  compass,
  thermometer,
  moon_phases: moonPhases,
  circuit,
} as const;
