// The drawings of the picture library (issue #252), drawn by hand for LearnBuddy — nothing
// licensed, nothing from a model. Each is a schematic as a schoolbook prints it, in a frame 1000
// wide (y down), made of the shapes in `drawShapes.ts`; every part has the tone it is drawn in (an
// index into the figure's pastels) and the point its number points at (`at`, chosen by hand: on
// the part, clear of the others). The parts stand in the order of their names
// (`schematics.data.ts`, which says what each is called).
//
// Only the app draws them, and it loads this file with the first picture (`useSchematicShapes`),
// so the drawings are no part of the start bundle; the server reads it for what a finger can tap.

import { arc, band, bloom, box, circle, ellipse, moon, poly, stroke } from './drawShapes.js';
import type { SchematicPartShape, SchematicShapes } from './schematics.js';

function shape(
  id: string,
  tone: number,
  at: readonly [number, number],
  rings: readonly string[],
): SchematicPartShape {
  return { id, tone, at, rings };
}

/** The pastels, by index into `figure.slices`; INK is the figure's ink (a pupil, a tyre). */
const LILAC = 0;
const BLUE = 1;
const GREEN = 2;
const ORANGE = 3;
const PINK = 4;
const YELLOW = 5;
const SAND = 6;
const TEAL = 7;
const INK = -1;

// ── cells ──────────────────────────────────────────────────────────────────

const plantCell = {
  lines: [],
  parts: [
    shape('cytoplasm', YELLOW, [690, 595], [box(196, 106, 608, 508, 30)]),
    shape(
      'membrane',
      PINK,
      [813, 300],
      band(box(178, 88, 644, 544, 40), box(196, 106, 608, 508, 30)),
    ),
    shape('wall', SAND, [164, 420], band(box(150, 60, 700, 600, 60), box(178, 88, 644, 544, 40))),
    shape('vacuole', BLUE, [570, 390], [ellipse(565, 390, 185, 145, 0, 0.04)]),
    shape('nucleus', LILAC, [315, 235], [circle(315, 235, 78)]),
    shape(
      'chloroplast',
      GREEN,
      [250, 470],
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
      [235, 345],
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
    shape('nucleus', LILAC, [392, 340], [circle(440, 300, 95)]),
    shape('nucleolus', TEAL, [462, 285], [circle(462, 285, 32)]),
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
const mirror = (xy: number[]) => xy.map((v, i) => (i % 2 === 0 ? 1000 - v : v));
/** A shape on both sides — a leg, a bone: the left one and its mirror image. */
const both = (width: number, ...xy: number[]) => [
  stroke(width, ...xy),
  stroke(width, ...mirror(xy)),
];

const flower = {
  lines: [],
  parts: [
    shape('stalk', GREEN, [500, 740], [stroke(34, 500, 815, 500, 600)]),
    shape('sepal', TEAL, [345, 552], [poly(...leftSepal), poly(...mirror(leftSepal))]),
    shape('petal', PINK, [330, 360], [poly(...leftPetal), poly(...mirror(leftPetal))]),
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
      [395, 505],
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
    shape('vitreous', YELLOW, [620, 300], [circle(560, 320, 190)]),
    shape('retina', PINK, [758, 230], [arc(560, 320, 190, 210, -110, 110)]),
    shape('sclera', SAND, [560, 100], [arc(560, 320, 210, 232, -145, 145)]),
    shape('cornea', BLUE, [300, 320], [arc(560, 320, 232, 266, 148, 212)]),
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
    shape('thorax', LILAC, [500, 385], [ellipse(500, 385, 56, 66)]),
    shape('head', YELLOW, [500, 290], [circle(500, 265, 48)]),
    shape('eye', TEAL, [462, 250], [circle(462, 250, 17), circle(538, 250, 17)]),
    shape(
      'antenna',
      SAND,
      [436, 150],
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
      [250, 562],
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
      [318, 462],
      [stroke(8, 250, 446, 382, 468), stroke(8, 250, 394, 382, 372)],
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
    shape('pedal', YELLOW, [430, 512], [stroke(10, 382, 420, 425, 505), box(398, 502, 64, 18, 4)]),
    shape('saddle', ORANGE, [338, 200], [poly(286, 196, 390, 188, 404, 204, 334, 216, 292, 210)]),
    shape('handlebar', TEAL, [712, 146], [stroke(14, 648, 205, 660, 150, 712, 140, 744, 162)]),
    shape('bell', YELLOW, [680, 118], [circle(680, 118, 15)]),
    shape('headlight', YELLOW, [712, 300], [box(694, 290, 38, 22, 6)]),
    shape(
      'spoke_reflector',
      YELLOW,
      [250, 330],
      [ellipse(250, 330, 24, 12), ellipse(760, 330, 24, 12)],
    ),
    shape('brake', SAND, [760, 266], [box(745, 259, 30, 14, 4), box(235, 259, 30, 14, 4)]),
    shape('rear_light', PINK, [276, 300], [box(258, 290, 36, 20, 5)]),
  ],
};

// ── apparatus ──────────────────────────────────────────────────────────────

const microscope = {
  lines: [],
  parts: [
    shape('arm', TEAL, [640, 680], [stroke(60, 640, 800, 640, 560, 560, 300)]),
    shape('foot', SAND, [380, 835], [box(300, 800, 420, 70, 20)]),
    shape('light', YELLOW, [470, 725], [ellipse(470, 725, 55, 32)]),
    shape('stage', BLUE, [370, 575], [box(320, 560, 300, 30, 6)]),
    shape('diaphragm', ORANGE, [470, 612], [box(415, 600, 110, 24, 6)]),
    shape('tube', GREEN, [470, 270], [box(432, 140, 76, 260, 8)]),
    shape('revolver', PINK, [405, 420], [ellipse(470, 420, 82, 30)]),
    shape('objective', LILAC, [470, 495], [box(442, 450, 56, 85, 10)]),
    shape('eyepiece', ORANGE, [470, 105], [box(418, 70, 104, 70, 10)]),
    shape('focus', YELLOW, [650, 470], [circle(650, 470, 42)]),
  ],
};

const lab = {
  lines: [],
  parts: [
    shape('test_tube', BLUE, [95, 360], [box(72, 170, 46, 320, 23)]),
    shape('beaker', TEAL, [250, 420], [poly(165, 250, 335, 250, 322, 500, 178, 500)]),
    shape(
      'erlenmeyer',
      LILAC,
      [425, 440],
      [poly(402, 170, 448, 170, 448, 300, 540, 500, 310, 500, 402, 300)],
    ),
    shape('round_flask', PINK, [635, 410], [box(615, 170, 40, 160, 6), circle(635, 410, 95)]),
    shape('cylinder', GREEN, [810, 330], [box(782, 140, 56, 345, 8), box(752, 480, 116, 22, 6)]),
    shape(
      'funnel',
      ORANGE,
      [930, 240],
      [poly(880, 190, 985, 190, 948, 320, 948, 430, 917, 430, 917, 320)],
    ),
  ],
};

// ── the body ───────────────────────────────────────────────────────────────

const heart = {
  lines: [],
  parts: [
    shape('vena_cava', LILAC, [270, 150], [stroke(60, 270, 300, 270, 70)]),
    shape('pulmonary_artery', TEAL, [425, 150], [stroke(58, 440, 310, 470, 180, 370, 110)]),
    shape(
      'aorta',
      ORANGE,
      [705, 98],
      [stroke(66, 560, 340, 560, 150, 650, 80, 760, 120, 790, 230)],
    ),
    shape('right_atrium', BLUE, [320, 385], [ellipse(330, 385, 120, 105)]),
    shape('left_atrium', PINK, [670, 360], [ellipse(650, 360, 125, 100)]),
    shape(
      'right_ventricle',
      BLUE,
      [370, 620],
      [poly(215, 470, 505, 470, 515, 560, 490, 700, 440, 800, 380, 790, 300, 700, 240, 590)],
    ),
    shape(
      'left_ventricle',
      PINK,
      [650, 620],
      [
        poly(
          505,
          470,
          800,
          460,
          812,
          560,
          765,
          680,
          650,
          800,
          540,
          860,
          470,
          835,
          440,
          800,
          490,
          700,
          515,
          560,
        ),
      ],
    ),
    shape('septum', SAND, [512, 560], [stroke(24, 505, 470, 515, 560, 490, 700, 440, 800)]),
  ],
};

const ear = {
  lines: [],
  parts: [
    shape('eustachian_tube', BLUE, [600, 560], [stroke(36, 500, 370, 600, 560, 690, 640)]),
    shape(
      'pinna',
      PINK,
      [120, 300],
      [
        poly(
          60,
          150,
          160,
          90,
          232,
          160,
          222,
          300,
          182,
          380,
          202,
          470,
          150,
          560,
          80,
          520,
          92,
          420,
          60,
          300,
        ),
      ],
    ),
    shape('canal', YELLOW, [330, 350], [box(212, 322, 232, 58, 20)]),
    shape('eardrum', ORANGE, [458, 350], [poly(440, 288, 466, 288, 478, 412, 452, 412)]),
    shape(
      'ossicles',
      SAND,
      [545, 300],
      [ellipse(502, 322, 22, 30), ellipse(545, 298, 18, 26, 30), ellipse(588, 322, 15, 22)],
    ),
    shape('canals', LILAC, [640, 186], band(ellipse(640, 230, 72, 56), ellipse(640, 230, 44, 30))),
    shape('cochlea', TEAL, [762, 380], band(ellipse(700, 385, 86, 76), ellipse(700, 385, 38, 32))),
    shape('nerve', YELLOW, [880, 302], [stroke(30, 782, 360, 880, 300, 960, 320)]),
  ],
};

const skeleton = {
  lines: [],
  parts: [
    shape(
      'ribcage',
      SAND,
      [400, 320],
      band(ellipse(500, 320, 130, 120), ellipse(500, 320, 92, 88)),
    ),
    shape('spine', YELLOW, [500, 495], [stroke(26, 500, 185, 500, 560)]),
    shape('skull', SAND, [500, 110], [circle(500, 110, 72)]),
    shape('collarbone', YELLOW, [430, 200], both(16, 380, 206, 488, 196)),
    shape(
      'pelvis',
      ORANGE,
      [420, 600],
      [poly(390, 540, 610, 540, 642, 620, 560, 662, 500, 632, 440, 662, 358, 620)],
    ),
    shape('humerus', SAND, [355, 330], both(22, 382, 218, 330, 440)),
    shape('forearm', TEAL, [315, 545], both(18, 328, 452, 300, 640)),
    shape('femur', SAND, [440, 745], both(28, 452, 655, 432, 830)),
    shape('tibia', TEAL, [428, 910], both(22, 432, 842, 426, 980)),
  ],
};

const organs = {
  // The body around the organs: head and trunk, drawn as a line.
  lines: [
    '420 40 470 20 530 20 580 40 600 110 580 175 540 195 460 195 420 175 400 110 420 40',
    '460 195 330 230 300 600 360 960 640 960 700 600 670 230 540 195',
  ],
  parts: [
    shape('brain', LILAC, [500, 100], [ellipse(500, 100, 75, 55)]),
    shape('trachea', BLUE, [500, 220], [stroke(26, 500, 170, 500, 255)]),
    shape('lungs', PINK, [400, 330], [ellipse(420, 340, 70, 112), ellipse(580, 340, 70, 112)]),
    shape('heart', ORANGE, [522, 390], [ellipse(522, 390, 45, 55, 20)]),
    shape('liver', SAND, [450, 485], [poly(380, 455, 560, 445, 545, 525, 400, 535)]),
    shape('stomach', YELLOW, [612, 495], [ellipse(605, 500, 55, 45, -20)]),
    shape('intestine', TEAL, [500, 760], [ellipse(500, 710, 135, 105)]),
    shape('kidneys', BLUE, [395, 590], [ellipse(395, 590, 25, 40), ellipse(605, 590, 25, 40)]),
  ],
};

// ── traffic ────────────────────────────────────────────────────────────────

/** A regular polygon around (cx, cy), one corner pointing at `deg`. */
const regular = (cx: number, cy: number, r: number, n: number, deg = 0) =>
  poly(
    ...Array.from({ length: n }, (_, i) => {
      const a = ((deg + (i * 360) / n) * Math.PI) / 180;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    }).flat(),
  );

const signs = {
  lines: [],
  parts: [
    // Each sign with its white symbol cut out, and what stands inside the symbol filled again.
    shape(
      'stop',
      PINK,
      [170, 170],
      [
        ...band(regular(170, 170, 118, 8, 22.5), regular(170, 170, 104, 8, 22.5)),
        regular(170, 170, 94, 8, 22.5),
      ],
    ),
    shape(
      'give_way',
      PINK,
      [500, 92],
      band(poly(380, 70, 620, 70, 500, 280), poly(425, 98, 575, 98, 500, 228)),
    ),
    shape(
      'priority_road',
      YELLOW,
      [830, 175],
      [
        ...band(regular(830, 175, 118, 4, 90), regular(830, 175, 100, 4, 90)),
        regular(830, 175, 74, 4, 90),
      ],
    ),
    shape(
      'crossing',
      BLUE,
      [110, 420],
      [
        ...band(box(75, 385, 190, 190, 12), poly(170, 405, 250, 550, 90, 550)),
        circle(170, 455, 13),
        stroke(12, 170, 470, 160, 505, 140, 530),
        stroke(10, 160, 505, 185, 530),
        box(118, 536, 104, 7),
      ],
    ),
    shape(
      'cycle_path',
      BLUE,
      [500, 400],
      [
        ...band(
          circle(500, 480, 98),
          circle(448, 505, 30),
          circle(552, 505, 30),
          stroke(10, 478, 505, 500, 462, 522, 505),
          stroke(10, 492, 452, 512, 452),
        ),
        circle(448, 505, 20),
        circle(552, 505, 20),
      ],
    ),
    shape(
      'one_way',
      BLUE,
      [730, 480],
      band(
        box(700, 435, 260, 90, 10),
        poly(725, 470, 880, 470, 880, 452, 935, 480, 880, 508, 880, 490, 725, 490),
      ),
    ),
  ],
};

// ── music ──────────────────────────────────────────────────────────────────

const instruments = {
  lines: [],
  parts: [
    shape(
      'guitar',
      SAND,
      [170, 440],
      [ellipse(170, 440, 95, 108), ellipse(170, 305, 70, 72), stroke(26, 170, 250, 170, 50)],
    ),
    shape('drum', ORANGE, [430, 430], [box(330, 340, 200, 160, 18), ellipse(430, 340, 100, 28)]),
    shape('recorder', YELLOW, [625, 330], [stroke(28, 610, 565, 640, 90)]),
    shape(
      'trumpet',
      LILAC,
      [760, 200],
      [stroke(24, 665, 200, 865, 200), poly(860, 162, 965, 120, 965, 280, 860, 238)],
    ),
    shape(
      'triangle',
      TEAL,
      [800, 552],
      band(poly(700, 565, 900, 565, 800, 382), poly(732, 543, 868, 543, 800, 422)),
    ),
  ],
};

// ── initial sounds ─────────────────────────────────────────────────────────

const anlaut = {
  lines: [],
  parts: [
    shape('apple', PINK, [125, 180], [circle(125, 180, 82), stroke(10, 125, 100, 140, 60)]),
    shape('ball', BLUE, [375, 170], [circle(375, 170, 90)]),
    shape('house', ORANGE, [625, 220], [poly(535, 190, 625, 90, 715, 190, 715, 280, 535, 280)]),
    shape('sun', YELLOW, [875, 170], [bloom(875, 170, 105, 10)]),
    shape('moon', YELLOW, [95, 480], [moon(125, 480, 90)]),
    shape(
      'fish',
      TEAL,
      [355, 480],
      [ellipse(355, 480, 90, 50), poly(430, 480, 500, 428, 500, 532)],
    ),
    shape(
      'ice_cream',
      PINK,
      [625, 450],
      [circle(625, 450, 58), poly(580, 488, 670, 488, 625, 615)],
    ),
    shape('tree', GREEN, [875, 430], [circle(875, 430, 90), box(855, 505, 40, 110, 6)]),
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
  microscope,
  lab,
  heart,
  ear,
  skeleton,
  organs,
  signs,
  instruments,
  anlaut,
};
