// The picture library's drawings of living things from issue #462: the teeth of a jaw, a joint,
// the organs of breathing and of digestion, a leaf in cross-section, a nerve cell, a mushroom and
// a seedling — each as a schoolbook draws it. Drawn by hand like every drawing of the library
// (`schematicShapes.data.ts` says how); the parts stand in the order of their names
// (`schematicLifeNames.data.ts`). Where the outline of the body only frames the parts (a torso, a
// head), it is a line, no part.

import {
  arc,
  box,
  circle,
  curve,
  ellipse,
  mirror,
  shape,
  smooth,
  stroke,
  TONE,
  turn,
} from './drawShapes.js';
import type { SchematicShape } from './schematics.js';

const { LILAC, BLUE, GREEN, ORANGE, PINK, YELLOW, SAND, TEAL } = TONE;

/** A thin line through the points x0, y0 … : an outline that frames the parts. */
const outline = (xy: readonly number[]) => xy.map(Math.round).join(' ');

// ── the teeth ──────────────────────────────────────────────────────────────
// The lower jaw of an adult from above, the front at the top: on each side two incisors, a
// canine, two premolars and three molars, sixteen teeth in the horseshoe of the gum.

/** The jaw's arch: an ellipse, its front at the top, a little past its widest at the back. */
const ARCH = { cx: 500, cy: 700, a: 360, b: 560 } as const;
/** Points along the arch from the front to the left, every 2 units of its length: [x, y, angle]. */
const archPoints = (() => {
  const out: Array<[number, number, number]> = [];
  let prev: [number, number] | null = null;
  let s = 0;
  for (let k = 0; k <= 2000; k++) {
    const t = -Math.PI / 2 - (k / 2000) * (Math.PI * 0.6);
    const p: [number, number] = [ARCH.cx + ARCH.a * Math.cos(t), ARCH.cy + ARCH.b * Math.sin(t)];
    if (prev) s += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    while (out.length * 2 <= s) {
      const tangent = (Math.atan2(ARCH.b * Math.cos(t), -ARCH.a * Math.sin(t)) * 180) / Math.PI;
      out.push([p[0], p[1], tangent]);
    }
    prev = p;
  }
  return out;
})();
/** Where on the left side of the arch the point `s` units from the front stands. */
const onArch = (s: number) => archPoints[Math.min(archPoints.length - 1, Math.round(s / 2))]!;
/** The teeth of one side from the front: their width along the arch and depth across it. */
const TEETH = [
  ['incisor', 58, 34],
  ['incisor', 58, 36],
  ['canine', 64, 60],
  ['premolar', 70, 72],
  ['premolar', 70, 76],
  ['molar', 100, 92],
  ['molar', 100, 96],
  ['molar', 100, 90],
] as const;
const GAP = 6;
/** Each tooth of the left side: its kind, middle on the arch, width, depth and the arch's angle. */
const leftTeeth = TEETH.map(([kind, w, d], i) => {
  const s = TEETH.slice(0, i).reduce((sum, [, tw]) => sum + tw + GAP, 0) + w / 2;
  const [x, y, deg] = onArch(s);
  return { kind, x, y, w, d, deg };
});
/** A tooth seen from above, turned to the arch: rounded, the canine with its point outward. */
function crown(t: (typeof leftTeeth)[number]): number[] {
  const { kind, x, y, w, d } = t;
  const [hw, hd] = [w / 2, d / 2];
  const local =
    kind === 'canine'
      ? [-hw, 0, -hw * 0.5, hd, hw * 0.5, hd, hw, 0, 0, -hd * 1.1]
      : [
          -hw,
          -hd * 0.6,
          -hw * 0.75,
          -hd,
          hw * 0.75,
          -hd,
          hw,
          -hd * 0.6,
          hw,
          hd * 0.6,
          hw * 0.75,
          hd,
          -hw * 0.75,
          hd,
          -hw,
          hd * 0.6,
        ];
  // Outward is y up before turning: the arch's outside.
  return turn(
    local.map((v, i) => (i % 2 === 0 ? x + v : y + v)),
    t.deg,
    x,
    y,
  );
}
/** A molar's grooves (a cross) and a premolar's (one line), along and across the tooth. */
function grooves(t: (typeof leftTeeth)[number]): number[][] {
  const { kind, x, y, w, d } = t;
  if (kind === 'molar')
    return [
      turn([x - w * 0.3, y, x + w * 0.3, y], t.deg, x, y),
      turn([x, y - d * 0.3, x, y + d * 0.3], t.deg, x, y),
    ];
  return kind === 'premolar' ? [turn([x - w * 0.25, y, x + w * 0.25, y], t.deg, x, y)] : [];
}
const teethOf = (kind: string) =>
  leftTeeth
    .filter((t) => t.kind === kind)
    .flatMap((t) => [smooth(...crown(t)), smooth(...mirror(crown(t)))]);
/** The gum: the arch from end to end, a little past the last molar. */
const gumLine = (() => {
  const half = archPoints.filter((_, i) => i * 2 <= 745 && i % 10 === 0).map(([x, y]) => [x, y]);
  return [...[...half].reverse().flat(), ...mirror(half.slice(1).flat())];
})();
/** Where the gum's name belongs: behind the last molar, on the right. */
const GUM_AT = onArch(722);
const teethGrooves = leftTeeth.flatMap((t) =>
  grooves(t).flatMap((g) => [stroke(5, ...g), stroke(5, ...mirror(g))]),
);

const teeth: SchematicShape = {
  lines: [],
  parts: [
    shape('gum', PINK, [1000 - GUM_AT[0], GUM_AT[1]], [stroke(150, ...gumLine)]),
    shape('incisor', YELLOW, [1000 - leftTeeth[0]!.x, leftTeeth[0]!.y], teethOf('incisor')),
    shape('canine', YELLOW, [leftTeeth[2]!.x, leftTeeth[2]!.y], teethOf('canine')),
    shape('premolar', YELLOW, [1000 - leftTeeth[4]!.x, leftTeeth[4]!.y], teethOf('premolar')),
    shape('molar', YELLOW, [leftTeeth[6]!.x, leftTeeth[6]!.y], teethOf('molar')),
  ],
  marks: { black: teethGrooves },
};

// ── a joint ────────────────────────────────────────────────────────────────
// A section through a ball-and-socket joint: the head of one bone in the socket of the other, both
// capped with cartilage, the thin joint space with its fluid between them, the capsule round it all.

const HEAD = [500, 420] as const;
const cavity = [
  395, 290, 340, 312, 285, 370, 278, 440, 285, 505, 330, 500, 352, 450, 362, 380, 385, 320,
];
const capsule = curve(400, 268, 330, 290, 282, 350, 268, 430, 272, 520);

const joint: SchematicShape = {
  lines: [],
  parts: [
    shape(
      'cavity',
      BLUE,
      [675, 420],
      [smooth(...cavity), smooth(...mirror(cavity)), arc(HEAD[0], HEAD[1], 162, 180, 15, 165)],
    ),
    shape('bone', SAND, [500, 120], [box(400, 20, 200, 340), box(400, 650, 200, 290)]),
    shape('socket', SAND, [664, 584], [arc(HEAD[0], HEAD[1], 202, 262, 25, 155)]),
    shape('joint_head', SAND, [500, 360], [circle(HEAD[0], HEAD[1], 140)]),
    shape(
      'cartilage',
      TEAL,
      [500, 611],
      [arc(HEAD[0], HEAD[1], 140, 162, 15, 165), arc(HEAD[0], HEAD[1], 180, 202, 20, 160)],
    ),
    shape('capsule', PINK, [270, 430], [stroke(26, ...capsule), stroke(26, ...mirror(capsule))]),
  ],
};

// ── breathing ──────────────────────────────────────────────────────────────
// The head in profile, the chest from the front, as the schoolbook joins them: the air through the
// nasal cavity or the mouth, down the pharynx, the larynx and the windpipe into the bronchi and
// the lungs; the diaphragm under them.

const LARYNX_TO_FORK = [585, 500, 500, 650] as const;
/** The windpipe's rings: short white strokes across it. */
const rings = [0.2, 0.38, 0.56, 0.74].map((t) => {
  const [x0, y0, x1, y1] = LARYNX_TO_FORK;
  const [dx, dy] = [x1 - x0, y1 - y0];
  const len = Math.hypot(dx, dy);
  const [px, py] = [(-dy / len) * 14, (dx / len) * 14];
  const [x, y] = [x0 + t * dx, y0 + t * dy];
  return stroke(6, x - px, y - py, x + px, y + py);
});
const bronchus = [500, 650, 430, 700, 385, 765];
const branches = [
  [408, 732, 350, 742],
  [395, 752, 380, 820],
];
const lung = [
  470, 600, 430, 585, 360, 610, 290, 680, 250, 780, 240, 880, 255, 935, 330, 925, 420, 905, 475,
  885, 482, 760,
];

const breathing: SchematicShape = {
  lines: [
    outline(
      curve(
        ...[
          430, 470, 430, 400, 400, 395, 360, 380, 345, 350, 350, 330, 340, 300, 345, 270, 335, 245,
          340, 215, 320, 205, 300, 185, 335, 150, 350, 100, 400, 45, 470, 30, 580, 35, 680, 90, 715,
          190, 700, 300, 640, 380, 600, 420, 590, 470,
        ],
      ),
    ),
    outline(curve(430, 470, 420, 500, 330, 520, 250, 545, 210, 620, 200, 800, 205, 990)),
    outline(curve(590, 470, 590, 500, 680, 520, 750, 545, 790, 620, 800, 800, 795, 990)),
  ],
  parts: [
    shape(
      'nasal_cavity',
      BLUE,
      [460, 175],
      [smooth(350, 160, 450, 135, 560, 150, 580, 195, 460, 210, 360, 200)],
    ),
    shape(
      'mouth',
      PINK,
      [455, 318],
      [smooth(360, 300, 450, 285, 545, 288, 590, 300, 588, 340, 450, 350, 368, 335)],
    ),
    shape(
      'pharynx',
      ORANGE,
      [600, 260],
      [stroke(48, ...curve(585, 180, 600, 300, 592, 420, 585, 445))],
    ),
    shape('larynx', LILAC, [585, 467], [smooth(550, 435, 612, 432, 620, 500, 552, 500)]),
    shape('lungs', PINK, [690, 830], [smooth(...lung), smooth(...mirror(lung))]),
    shape('trachea', BLUE, [528, 600], [stroke(40, ...LARYNX_TO_FORK)]),
    shape(
      'bronchi',
      TEAL,
      [399, 745],
      [
        stroke(26, ...bronchus),
        stroke(26, ...mirror(bronchus)),
        ...branches.flatMap((b) => [stroke(14, ...b), stroke(14, ...mirror(b))]),
      ],
    ),
    shape(
      'diaphragm',
      ORANGE,
      [300, 937],
      [stroke(28, ...curve(200, 965, 300, 935, 420, 945, 500, 962, 580, 945, 700, 935, 800, 965))],
    ),
  ],
  marks: { white: rings },
};

// ── digestion ──────────────────────────────────────────────────────────────
// The trunk from the front, the food's way down: the oesophagus to the stomach, the liver with the
// gallbladder over it, the pancreas behind the stomach, the small intestine coiled in the frame of
// the large one, the appendix at its start and the rectum at its end.

const digestion: SchematicShape = {
  lines: [
    outline(curve(300, 10, 290, 150, 230, 300, 200, 500, 210, 700, 230, 900, 290, 990)),
    outline(mirror(curve(300, 10, 290, 150, 230, 300, 200, 500, 210, 700, 230, 900, 290, 990))),
  ],
  parts: [
    shape(
      'liver',
      SAND,
      [270, 370],
      [
        smooth(
          ...[
            180, 320, 330, 280, 500, 290, 600, 300, 610, 330, 540, 380, 430, 440, 300, 480, 210,
            460, 175, 390,
          ],
        ),
      ],
    ),
    shape(
      'gallbladder',
      GREEN,
      [390, 478],
      [smooth(372, 430, 405, 440, 415, 492, 388, 515, 362, 488)],
    ),
    shape(
      'esophagus',
      PINK,
      [510, 150],
      [stroke(34, ...curve(505, 10, 510, 150, 520, 260, 560, 320, 600, 335))],
    ),
    shape(
      'pancreas',
      YELLOW,
      [520, 575],
      [smooth(440, 560, 560, 548, 700, 558, 760, 578, 700, 600, 560, 596, 450, 590)],
    ),
    shape(
      'stomach',
      PINK,
      [745, 420],
      [
        smooth(
          ...[
            590, 320, 680, 300, 770, 340, 800, 420, 782, 500, 700, 545, 600, 545, 548, 520, 562,
            490, 640, 478, 690, 440, 662, 380, 600, 360,
          ],
        ),
      ],
    ),
    shape(
      'small_intestine',
      ORANGE,
      [500, 760],
      [
        stroke(
          32,
          ...curve(
            ...[
              360, 700, 640, 700, 662, 730, 640, 760, 360, 760, 338, 790, 360, 820, 640, 820, 662,
              845, 620, 868,
            ],
          ),
        ),
      ],
    ),
    shape(
      'large_intestine',
      TEAL,
      [258, 760],
      [
        stroke(
          56,
          ...curve(
            ...[
              268, 905, 255, 760, 260, 650, 330, 630, 500, 640, 670, 630, 750, 650, 760, 760, 740,
              860, 640, 900, 560, 905,
            ],
          ),
        ),
      ],
    ),
    shape('appendix', TEAL, [247, 940], [stroke(16, ...curve(255, 896, 240, 935, 250, 968))]),
    shape('rectum', LILAC, [515, 950], [stroke(44, ...curve(565, 902, 522, 930, 505, 990))]),
  ],
};

// ── a leaf in cross-section ────────────────────────────────────────────────
// Its layers top to bottom: the waxy cuticle, the upper epidermis, the tall palisade cells, the
// loose spongy cells round a vascular bundle, the lower epidermis with a stoma — two guard cells
// round the pore, the air space above it.

/** Spongy cells on a staggered grid, turned a little each, none in the bundle or the air space. */
const spongy = Array.from({ length: 3 }, (_, r) =>
  Array.from({ length: 13 }, (_, c) => [
    100 + c * 68 + (r % 2) * 34,
    362 + r * 56,
    ((c * 37 + r * 53) % 60) - 30,
  ]),
)
  .flat()
  .filter(([x = 0, y = 0]) => !(Math.abs(x - 500) < 120 && Math.abs(y - 420) < 85))
  .filter(([x = 0, y = 0]) => !(x > 670 && x < 790 && y > 440))
  .filter(([x = 0]) => x < 920)
  .map(([x = 0, y = 0, deg = 0]) => ellipse(x, y, 30, 22, deg));

const leaf: SchematicShape = {
  lines: [],
  parts: [
    shape('cuticle', YELLOW, [300, 68], [box(60, 60, 880, 16, 4), box(60, 560, 880, 14, 4)]),
    shape(
      'upper_epidermis',
      TEAL,
      [580, 105],
      Array.from({ length: 11 }, (_, i) => box(60 + 80 * i, 76, 80, 58, 10)),
    ),
    shape(
      'palisade',
      GREEN,
      [718, 230],
      Array.from({ length: 20 }, (_, i) => box(62 + 44 * i, 140, 40, 180, 16)),
    ),
    shape('spongy', GREEN, [204, 418], spongy),
    shape('vascular_bundle', ORANGE, [500, 420], [ellipse(500, 420, 80, 62)]),
    shape(
      'lower_epidermis',
      TEAL,
      [300, 530],
      Array.from({ length: 11 }, (_, i) => i)
        .filter((i) => i !== 8)
        .map((i) => box(60 + 80 * i, 500, 80, 60, 10)),
    ),
    shape('stoma', LILAC, [740, 530], [ellipse(721, 530, 18, 28), ellipse(759, 530, 18, 28)]),
  ],
  marks: {
    // The bundle's vessels (white) and the dots of chloroplasts would be noise at this size: only
    // the vessels, which tell the bundle from a cell.
    white: [circle(475, 400, 13), circle(505, 395, 15), circle(535, 405, 12), circle(490, 430, 10)],
  },
};

// ── a nerve cell ───────────────────────────────────────────────────────────
// Dendrites round the cell body with its nucleus, the axon leaving it, sheathed in myelin with the
// gaps between the sheaths, and the terminals it ends in.

const dendrites = [
  stroke(16, ...curve(150, 260, 100, 200, 60, 130)),
  stroke(10, 100, 200, 140, 120),
  stroke(16, ...curve(140, 390, 90, 440, 50, 510)),
  stroke(10, 90, 440, 120, 530),
  stroke(16, ...curve(240, 220, 262, 140, 245, 60)),
  stroke(10, 258, 150, 320, 95),
  stroke(14, ...curve(250, 450, 285, 520, 275, 595)),
  stroke(12, 120, 320, 40, 320),
];
const terminals = [
  stroke(10, 866, 375, 910, 320, 940, 290),
  stroke(10, 866, 375, 930, 375),
  stroke(10, 866, 375, 910, 430, 940, 460),
  circle(950, 285, 18),
  circle(945, 375, 18),
  circle(950, 465, 18),
];

const neuron: SchematicShape = {
  lines: [],
  parts: [
    shape('dendrites', LILAC, [77, 160], dendrites),
    shape(
      'cell_body',
      LILAC,
      [250, 420],
      [
        smooth(
          ...[
            140, 230, 230, 210, 290, 250, 330, 320, 355, 365, 310, 430, 230, 460, 150, 430, 110,
            330,
          ],
        ),
      ],
    ),
    shape('nucleus', ORANGE, [190, 290], [circle(190, 290, 40)]),
    shape('axon', SAND, [450, 375], [stroke(20, 345, 375, 870, 375)]),
    shape(
      'myelin',
      YELLOW,
      [692, 375],
      [0, 1, 2].map((i) => box(520 + i * 120, 345, 104, 60, 26)),
    ),
    shape('terminals', PINK, [950, 285], terminals),
  ],
};

// ── a mushroom ─────────────────────────────────────────────────────────────
// The fruiting body above the ground — cap, gills under it, the ring on the stem — and below it
// the mycelium, the fungus itself.

const mycelium = [
  stroke(8, ...curve(500, 790, 420, 840, 330, 862, 250, 900)),
  stroke(8, ...curve(500, 790, 580, 850, 680, 870, 760, 910)),
  stroke(6, 420, 840, 400, 925),
  stroke(6, 330, 862, 280, 830),
  stroke(6, 610, 860, 630, 935),
  stroke(6, 680, 870, 735, 840),
  stroke(6, 500, 790, 505, 930),
];

const mushroom: SchematicShape = {
  lines: ['60 780 940 780'],
  parts: [
    shape('mycelium', SAND, [330, 862], mycelium),
    shape(
      'stem',
      SAND,
      [500, 640],
      [smooth(450, 380, 550, 380, 560, 600, 575, 782, 425, 782, 440, 600)],
    ),
    shape(
      'ring',
      YELLOW,
      [500, 478],
      [smooth(430, 450, 570, 450, 600, 480, 560, 502, 440, 502, 400, 480)],
    ),
    shape(
      'gills',
      LILAC,
      [330, 352],
      [smooth(170, 330, 500, 300, 830, 330, 790, 370, 500, 386, 210, 370)],
    ),
    shape(
      'cap',
      ORANGE,
      [500, 200],
      [smooth(160, 340, 220, 220, 350, 130, 500, 105, 650, 130, 780, 220, 840, 340, 500, 318)],
    ),
  ],
  marks: {
    // The gills' blades, fanning out under the cap.
    black: Array.from({ length: 15 }, (_, i) => {
      const x = 225 + i * 39;
      return stroke(3, x, 340, 500 + (x - 500) * 0.92, 374);
    }),
  },
};

// ── a seedling ─────────────────────────────────────────────────────────────
// A bean a week after sowing: the main root with its side roots in the soil, the stem, the two
// thick cotyledons it lives on, the first two leaves above them.

const sideRoots = [
  [503, 660, 420, 720, 380, 790],
  [503, 740, 430, 800, 400, 870],
  [499, 830, 450, 890],
];
const firstLeaf = [495, 270, 430, 230, 330, 200, 260, 220, 270, 280, 350, 320, 440, 310];
const cotyledon = [495, 430, 440, 400, 370, 410, 330, 450, 350, 500, 420, 505, 480, 480];

const seedling: SchematicShape = {
  lines: ['120 600 880 600'],
  parts: [
    shape('main_root', SAND, [497, 920], [stroke(22, ...curve(500, 600, 505, 750, 495, 950))]),
    shape(
      'lateral_roots',
      SAND,
      [386, 780],
      sideRoots.flatMap((r) => [stroke(9, ...r), stroke(9, ...mirror(r))]),
    ),
    shape(
      'stem',
      GREEN,
      [500, 560],
      [stroke(26, ...curve(500, 600, 495, 450, 500, 320, 500, 270))],
    ),
    shape('cotyledon', YELLOW, [390, 455], [smooth(...cotyledon), smooth(...mirror(cotyledon))]),
    shape(
      'leaf',
      TEAL,
      [340, 255],
      [smooth(...firstLeaf), smooth(...mirror(firstLeaf)), ellipse(500, 262, 16, 24)],
    ),
  ],
};

/** The drawings of living things, by name. */
export const SCHEMATIC_LIFE = {
  teeth,
  joint,
  breathing,
  digestion,
  leaf,
  neuron,
  mushroom,
  seedling,
} as const;
