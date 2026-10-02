// Our own schematic drawings with named parts (issue #252). docs/architecture.md §Practice
// ("Figure library").
//
// A drawing is CODE, never a model's output and nothing licensed (#224): the art is drawn in the
// app (`apps/mobile/components/practice/figure/schematics/`), and this file is what the API and
// the app agree on — which drawings exist, which parts each has, and where on the drawing each
// part is (`at`, in the drawing's own units; `w` is always 100). The names of the parts are words
// in five languages (`apps/api/src/i18n/*.json`, `library.parts`), so a key is the library's name
// and never one a model wrote.
//
// How a part is pointed at: a leader line (Beschriftungslinie) from `at` to a pin at the margin —
// left, right or under the drawing (`side`). The pins, not the parts, are what she taps and what
// carries a number: a cell nucleus is a few points across on a phone, a pin is always 44 pt.
// The pins of one side stand in the order of their parts (top to bottom, or left to right under
// the drawing), so leader lines do not cross. How many pins fit one side is capped below and
// checked when a task is built (apps/api/src/modules/practice/library.ts).

import { z } from 'zod';

export const SchematicSide = z.enum(['l', 'r', 'b']);
export type SchematicSide = z.infer<typeof SchematicSide>;

export type SchematicPart = { x: number; y: number; side: SchematicSide };

export type SchematicDrawing = {
  /** Height in the drawing's units; the width is always 100. */
  h: number;
  /** The school subject a drawing belongs to (what the generator is told). */
  subject: 'biology' | 'chemistry' | 'general';
  parts: Record<string, SchematicPart>;
};

const p = (x: number, y: number, side: SchematicSide): SchematicPart => ({ x, y, side });

export const SCHEMATIC_IDS = [
  'plant_cell',
  'animal_cell',
  'flower',
  'plant',
  'eye',
  'ear',
  'heart',
  'skeleton',
  'tooth',
  'organs',
  'insect',
  'microscope',
  'burner',
  'glassware',
  'bicycle',
] as const;
export const SchematicId = z.enum(SCHEMATIC_IDS);
export type SchematicId = z.infer<typeof SchematicId>;

export const SCHEMATICS: Record<SchematicId, SchematicDrawing> = {
  plant_cell: {
    h: 80,
    subject: 'biology',
    parts: {
      cell_wall: p(3.5, 24, 'l'),
      membrane: p(7.3, 62, 'l'),
      nucleus: p(22, 30, 'l'),
      cytoplasm: p(40, 64, 'l'),
      vacuole: p(66, 38, 'r'),
      chloroplast: p(86, 58, 'r'),
      mitochondria: p(74, 68, 'r'),
    },
  },
  animal_cell: {
    h: 80,
    subject: 'biology',
    parts: {
      membrane: p(7.5, 46, 'l'),
      mitochondria: p(25, 29, 'l'),
      cytoplasm: p(30, 58, 'l'),
      nucleolus: p(55, 36, 'r'),
      nucleus: p(62, 46, 'r'),
    },
  },
  flower: {
    h: 100,
    subject: 'biology',
    parts: {
      petal: p(14, 38, 'l'),
      anther: p(31, 28, 'l'),
      filament: p(37, 46, 'l'),
      sepal: p(34, 69, 'l'),
      stigma: p(51, 24, 'r'),
      style: p(51, 40, 'r'),
      ovary: p(54, 63, 'r'),
      stem: p(51, 90, 'r'),
    },
  },
  plant: {
    h: 100,
    subject: 'biology',
    parts: {
      blossom: p(50, 13, 'r'),
      bud: p(77, 33, 'r'),
      leaf: p(22, 47, 'l'),
      stem: p(51, 62, 'r'),
      root: p(44, 90, 'l'),
    },
  },
  eye: {
    h: 80,
    subject: 'biology',
    parts: {
      iris: p(29, 26, 'l'),
      pupil: p(29.3, 40, 'l'),
      cornea: p(19.5, 48, 'l'),
      lens: p(36, 36, 'r'),
      retina: p(83.5, 25.3, 'r'),
      vitreous: p(60, 52, 'r'),
      optic_nerve: p(95, 51, 'r'),
    },
  },
  ear: {
    h: 80,
    subject: 'biology',
    parts: {
      pinna: p(9, 28, 'l'),
      ear_canal: p(30, 43, 'l'),
      eardrum: p(47, 43, 'l'),
      semicircular: p(72, 18, 'r'),
      ossicles: p(56, 36, 'r'),
      cochlea: p(78, 48, 'r'),
      eustachian: p(63, 66, 'r'),
    },
  },
  heart: {
    h: 100,
    subject: 'biology',
    parts: {
      vena_cava: p(18, 14, 'l'),
      pulmonary: p(38, 20, 'l'),
      right_atrium: p(28, 44, 'l'),
      right_ventr: p(38, 70, 'l'),
      aorta: p(58, 9, 'r'),
      left_atrium: p(70, 38, 'r'),
      septum: p(51, 60, 'r'),
      left_ventr: p(64, 74, 'r'),
    },
  },
  skeleton: {
    h: 120,
    subject: 'biology',
    parts: {
      clavicle: p(38, 26, 'l'),
      humerus: p(27, 40, 'l'),
      pelvis: p(41, 65, 'l'),
      femur: p(43, 84, 'l'),
      skull: p(56, 10, 'r'),
      ribcage: p(58, 40, 'r'),
      spine: p(51, 58, 'r'),
      tibia: p(58, 104, 'r'),
    },
  },
  tooth: {
    h: 100,
    subject: 'biology',
    parts: {
      enamel: p(30, 20, 'l'),
      dentin: p(38, 32, 'l'),
      gum: p(13, 50, 'l'),
      crown: p(68, 16, 'r'),
      pulp: p(50, 40, 'r'),
      root: p(60, 76, 'r'),
      jawbone: p(86, 82, 'r'),
    },
  },
  organs: {
    h: 110,
    subject: 'biology',
    parts: {
      lungs: p(30, 34, 'l'),
      liver: p(32, 59, 'l'),
      large_int: p(24, 84, 'l'),
      trachea: p(50, 10, 'r'),
      heart: p(57, 40, 'r'),
      stomach: p(70, 60, 'r'),
      small_int: p(52, 82, 'r'),
    },
  },
  insect: {
    h: 90,
    subject: 'biology',
    parts: {
      antenna: p(38, 4, 'l'),
      compound_eye: p(45, 15, 'l'),
      leg: p(24, 38, 'l'),
      abdomen: p(46, 66, 'l'),
      head: p(52, 11, 'r'),
      thorax: p(56, 33, 'r'),
      wing: p(68, 48, 'r'),
    },
  },
  microscope: {
    h: 110,
    subject: 'biology',
    parts: {
      eyepiece: p(37, 8, 'l'),
      objective: p(39, 49, 'l'),
      stage: p(28, 58, 'l'),
      lamp: p(40, 79, 'l'),
      tube: p(44, 24, 'r'),
      arm: p(73, 44, 'r'),
      focus: p(74, 62, 'r'),
      base: p(62, 100, 'r'),
    },
  },
  burner: {
    h: 100,
    subject: 'chemistry',
    parts: {
      air_hole: p(50, 72, 'l'),
      gas_inlet: p(14, 84, 'l'),
      flame: p(50, 15, 'r'),
      barrel: p(51, 50, 'r'),
      base: p(66, 93, 'r'),
    },
  },
  glassware: {
    h: 64,
    subject: 'chemistry',
    parts: {
      test_tube: p(10, 40, 'b'),
      beaker: p(29, 48, 'b'),
      erlenmeyer: p(50, 48, 'b'),
      flask: p(70, 48, 'b'),
      cylinder: p(90, 44, 'b'),
    },
  },
  bicycle: {
    h: 64,
    subject: 'general',
    parts: {
      saddle: p(32, 14, 'l'),
      carrier: p(18, 24, 'l'),
      rear_light: p(6, 28, 'l'),
      pedal: p(45, 52, 'l'),
      bell: p(68, 10, 'r'),
      brake: p(78, 27, 'r'),
      front_light: p(85, 22, 'r'),
      spoke_refl: p(86, 50, 'r'),
    },
  },
};

/** At least two pins: one pin is no choice. At most eight: two sides of four. */
export const SCHEMATIC_PARTS_MIN = 2;
export const SCHEMATIC_PARTS_MAX = 8;
/** Pins one side holds at 44 pt each on a 360×740 phone, with the question above. */
export const SCHEMATIC_SIDE_MAX = 4;
/** Pins under a drawing: five at 44 pt with room between them on 328 pt. */
export const SCHEMATIC_BOTTOM_MAX = 5;

export function schematicPartIds(drawing: SchematicId): string[] {
  return Object.keys(SCHEMATICS[drawing].parts);
}

/**
 * The parts in the order their pins stand — left side top to bottom, right side top to bottom,
 * then under the drawing left to right — which is also the order of their numbers 1, 2, 3 …
 * Unknown ids are left out.
 */
export function pinOrder(drawing: SchematicId, parts: readonly string[]): string[] {
  const d = SCHEMATICS[drawing].parts;
  const rank = { l: 0, r: 1, b: 2 } as const;
  return parts
    .filter((id) => id in d)
    .sort((a, b) => {
      const pa = d[a]!;
      const pb = d[b]!;
      if (pa.side !== pb.side) return rank[pa.side] - rank[pb.side];
      return pa.side === 'b' ? pa.x - pb.x : pa.y - pb.y || pa.x - pb.x;
    });
}
