// The drawings of the picture library (issue #252), drawn by hand for LearnBuddy — nothing
// licensed, nothing from a model. Each is a schematic as a schoolbook prints it, in a frame 1000
// wide (y down), made of the shapes in `drawShapes.ts`; every part has the tone it is drawn in (an
// index into the figure's pastels) and the point its number points at (`at`, chosen by hand: on
// the part, clear of the others). The parts stand in the order of their names
// (`schematics.data.ts`, which says what each is called).
//
// This file holds the drawings of the first part and gathers the rest: the body
// (`schematicBody.data.ts`) and things (`schematicThings.data.ts`). Only the app draws them, and it
// loads this file with the first picture (`useSchematicShapes`), so the drawings are no part of
// the start bundle; the server reads it for what a finger can tap.

import {
  arc,
  band,
  bloom,
  both,
  box,
  circle,
  ellipse,
  mirror,
  poly,
  shape,
  stroke,
  TONE,
} from './drawShapes.js';
import { SCHEMATIC_BODY } from './schematicBody.data.js';
import { SCHEMATIC_THINGS } from './schematicThings.data.js';
import type { SchematicShapes } from './schematics.js';

const { LILAC, BLUE, GREEN, ORANGE, PINK, YELLOW, SAND, TEAL, INK } = TONE;

// ── cells ──────────────────────────────────────────────────────────────────

const plantCell = {
  lines: [],
  parts: [
    shape('cytoplasm', YELLOW, [690, 595], [box(196, 106, 608, 508, 30)]),
    shape(
      'membrane',
      PINK,
      [500, 97],
      band(box(178, 88, 644, 544, 40), box(196, 106, 608, 508, 30)),
    ),
    shape('wall', SAND, [164, 420], band(box(150, 60, 700, 600, 60), box(178, 88, 644, 544, 40))),
    shape('vacuole', BLUE, [570, 390], [ellipse(565, 390, 185, 145, 0, 0.04)]),
    shape('nucleus', LILAC, [315, 235], [circle(315, 235, 78)]),
    shape(
      'chloroplast',
      GREEN,
      [275, 578],
      [
        ellipse(250, 470, 46, 22, -20),
        ellipse(470, 160, 46, 20, 10),
        ellipse(755, 190, 46, 22, 30),
        ellipse(610, 586, 46, 20),
        ellipse(275, 578, 44, 20, 15),
      ],
    ),
    shape(
      'mitochondrion',
      ORANGE,
      [772, 430],
      [ellipse(235, 345, 34, 17, 30), ellipse(772, 430, 17, 34)],
    ),
  ],
};

const animalCell = {
  lines: [],
  parts: [
    shape('cytoplasm', YELLOW, [600, 520], [ellipse(500, 320, 330, 252, 0, 0.05)]),
    shape(
      'membrane',
      PINK,
      [170, 320],
      band(ellipse(500, 320, 352, 274, 0, 0.05), ellipse(500, 320, 330, 252, 0, 0.05)),
    ),
    shape('nucleus', LILAC, [375, 355], [circle(440, 300, 95)]),
    shape('nucleolus', TEAL, [485, 268], [circle(485, 268, 30)]),
    shape(
      'mitochondrion',
      ORANGE,
      [680, 230],
      [
        ellipse(680, 230, 48, 22, 25),
        ellipse(300, 470, 48, 22, -15),
        ellipse(700, 425, 44, 20, 70),
      ],
    ),
  ],
};

// ── plants ─────────────────────────────────────────────────────────────────

const leftPetal = [
  455, 560, 380, 520, 300, 430, 250, 320, 270, 230, 330, 260, 390, 350, 440, 450, 470, 540,
];
const leftSepal = [470, 585, 400, 600, 320, 560, 290, 520, 360, 535, 430, 560];

const flower = {
  lines: [],
  parts: [
    shape('stalk', GREEN, [500, 740], [stroke(34, 500, 815, 500, 600)]),
    shape('sepal', TEAL, [345, 552], [poly(...leftSepal), poly(...mirror(leftSepal))]),
    shape('petal', PINK, [290, 330], [poly(...leftPetal), poly(...mirror(leftPetal))]),
    shape('receptacle', SAND, [500, 602], [ellipse(500, 592, 95, 32)]),
    shape(
      'stamen',
      YELLOW,
      [428, 345],
      [
        stroke(10, 472, 562, 434, 376),
        ellipse(428, 345, 22, 30, -15),
        stroke(10, 528, 562, 566, 376),
        ellipse(572, 345, 22, 30, 15),
      ],
    ),
    shape('ovary', LILAC, [500, 520], [ellipse(500, 505, 52, 62)]),
    shape('style', BLUE, [500, 395], [box(489, 330, 22, 118)]),
    shape('stigma', ORANGE, [500, 318], [ellipse(500, 318, 40, 18)]),
  ],
};

const leftLeaf = [490, 522, 440, 488, 370, 474, 300, 500, 362, 532, 432, 538];
const plant = {
  lines: ['120 640 880 640'],
  parts: [
    shape(
      'root',
      SAND,
      [500, 760],
      [
        stroke(16, 500, 640, 500, 830),
        stroke(10, 490, 700, 430, 770, 385, 845),
        stroke(10, 510, 690, 580, 760, 630, 830),
        stroke(8, 491, 785, 445, 840),
      ],
    ),
    shape('stem', GREEN, [500, 590], [stroke(18, 500, 640, 500, 300)]),
    shape(
      'leaf',
      TEAL,
      [340, 503],
      [poly(...leftLeaf), poly(...mirror(leftLeaf).map((v, i) => (i % 2 ? v - 90 : v)))],
    ),
    shape('blossom', PINK, [500, 215], [bloom(500, 215, 105, 6)]),
  ],
};

// ── the body ───────────────────────────────────────────────────────────────

const eye = {
  lines: [],
  parts: [
    shape('optic_nerve', SAND, [880, 322], [box(780, 292, 150, 60, 12)]),
    shape('vitreous', YELLOW, [600, 430], [circle(560, 320, 190)]),
    shape('retina', PINK, [758, 230], [arc(560, 320, 190, 210, -110, 110)]),
    shape('sclera', SAND, [560, 100], [arc(560, 320, 210, 232, -145, 145)]),
    shape('cornea', BLUE, [319, 384], [arc(560, 320, 232, 266, 148, 212)]),
    shape('lens', TEAL, [430, 320], [ellipse(430, 320, 38, 85)]),
    shape('iris', ORANGE, [376, 222], [box(366, 186, 20, 82, 6), box(366, 372, 20, 82, 6)]),
    shape('pupil', INK, [376, 320], [box(368, 272, 16, 96, 4)]),
  ],
};

const toothCrown = [345, 312, 352, 190, 405, 140, 500, 128, 595, 140, 648, 190, 655, 312];
const tooth = {
  lines: [],
  parts: [
    shape('jawbone', SAND, [255, 800], [box(190, 575, 620, 305, 30)]),
    shape(
      'gum',
      PINK,
      [262, 545],
      [
        poly(190, 610, 200, 525, 255, 478, 340, 460, 360, 540, 352, 610),
        poly(...mirror([190, 610, 200, 525, 255, 478, 340, 460, 360, 540, 352, 610])),
      ],
    ),
    shape(
      'dentin',
      YELLOW,
      [610, 430],
      [
        poly(
          330,
          300,
          340,
          180,
          400,
          120,
          500,
          105,
          600,
          120,
          660,
          180,
          670,
          300,
          650,
          520,
          620,
          820,
          570,
          840,
          540,
          620,
          500,
          580,
          460,
          620,
          430,
          840,
          380,
          820,
          350,
          520,
        ),
      ],
    ),
    shape(
      'enamel',
      BLUE,
      [500, 104],
      band(
        poly(318, 312, 325, 170, 395, 100, 500, 80, 605, 100, 675, 170, 682, 312),
        poly(...toothCrown),
      ),
    ),
    shape(
      'pulp',
      ORANGE,
      [500, 330],
      [
        poly(
          440,
          252,
          470,
          200,
          530,
          200,
          560,
          252,
          555,
          470,
          590,
          790,
          575,
          800,
          520,
          562,
          500,
          545,
          480,
          562,
          425,
          800,
          410,
          790,
          445,
          470,
        ),
      ],
    ),
  ],
};

// ── animals ────────────────────────────────────────────────────────────────

const legs = [
  [468, 345, 400, 300, 350, 230],
  [464, 385, 380, 398, 318, 452],
  [470, 420, 410, 482, 372, 562],
];
const insect = {
  lines: [],
  parts: [
    shape(
      'leg',
      SAND,
      [352, 236],
      legs.flatMap((l) => both(12, ...l)),
    ),
    shape(
      'wing',
      BLUE,
      [262, 455],
      [ellipse(330, 470, 150, 52, -25), ellipse(670, 470, 150, 52, 25)],
    ),
    shape('abdomen', ORANGE, [500, 640], [ellipse(500, 610, 70, 175)]),
    shape('thorax', LILAC, [500, 440], [ellipse(500, 385, 56, 66)]),
    shape('head', YELLOW, [500, 298], [circle(500, 265, 48)]),
    shape('eye', TEAL, [538, 250], [circle(462, 250, 17), circle(538, 250, 17)]),
    shape(
      'antenna',
      SAND,
      [598, 120],
      [stroke(9, 482, 222, 450, 160, 400, 118), stroke(9, 518, 222, 550, 160, 600, 118)],
    ),
  ],
};

// ── things ─────────────────────────────────────────────────────────────────

/** Spokes of a wheel around (cx, cy). */
const spokes = (cx: number, cy: number) =>
  Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 8;
    const dx = Math.round(130 * Math.cos(a));
    const dy = Math.round(130 * Math.sin(a));
    return `${cx - dx} ${cy - dy} ${cx + dx} ${cy + dy}`;
  });

const bicycle = {
  lines: [...spokes(250, 420), ...spokes(760, 420)],
  parts: [
    shape(
      'rear_wheel',
      INK,
      [119, 472],
      [...band(circle(250, 420, 150), circle(250, 420, 132)), circle(250, 420, 16)],
    ),
    shape(
      'front_wheel',
      INK,
      [760, 562],
      [...band(circle(760, 420, 150), circle(760, 420, 132)), circle(760, 420, 16)],
    ),
    shape(
      'chain',
      SAND,
      [290, 440],
      [stroke(8, 250, 434, 382, 454), stroke(8, 250, 406, 382, 386)],
    ),
    shape(
      'frame',
      BLUE,
      [520, 315],
      [
        stroke(18, 382, 420, 345, 215),
        stroke(18, 345, 232, 640, 232),
        stroke(18, 382, 420, 640, 250),
        stroke(14, 382, 420, 250, 420),
        stroke(14, 345, 232, 250, 420),
        stroke(16, 645, 200, 760, 420),
      ],
    ),
    shape(
      'carrier',
      SAND,
      [200, 254],
      [stroke(10, 352, 250, 140, 256), stroke(8, 168, 258, 246, 410)],
    ),
    shape(
      'pedal',
      YELLOW,
      [430, 512],
      [
        ...band(circle(382, 420, 36), circle(382, 420, 24)),
        stroke(10, 382, 420, 425, 505),
        box(398, 502, 64, 18, 4),
      ],
    ),
    shape('saddle', ORANGE, [338, 200], [poly(286, 196, 390, 188, 404, 204, 334, 216, 292, 210)]),
    shape('handlebar', TEAL, [712, 146], [stroke(14, 648, 205, 660, 150, 712, 140, 744, 162)]),
    shape('bell', YELLOW, [686, 128], [circle(686, 128, 14)]),
    shape(
      'headlight',
      YELLOW,
      [688, 228],
      [poly(664, 214, 700, 208, 712, 228, 700, 248, 664, 242)],
    ),
    shape(
      'spoke_reflector',
      YELLOW,
      [760, 330],
      [ellipse(250, 330, 24, 12), ellipse(760, 330, 24, 12)],
    ),
    shape('brake', SAND, [692, 286], [box(680, 276, 24, 20, 5), box(306, 276, 24, 20, 5)]),
    shape('rear_light', PINK, [143, 268], [box(126, 256, 34, 24, 6)]),
  ],
};

/** Where every part of every drawing stands. */
export const SCHEMATIC_SHAPES: SchematicShapes = {
  plant_cell: plantCell,
  animal_cell: animalCell,
  flower,
  plant,
  eye,
  tooth,
  insect,
  bicycle,
  ...SCHEMATIC_THINGS,
  ...SCHEMATIC_BODY,
};
