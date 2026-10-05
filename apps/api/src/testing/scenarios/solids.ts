// Scripted model answers for the browser walkthrough of solids, cube nets and points in space
// (tests/web/solids.spec.ts, issue #255). Every figure and key here passes the server's own
// checks (`modules/practice/solidCheck.ts`) — the walkthrough sees what a learner would. The
// integration test (`solids.int.test.ts`) uses the same figures.
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 2,
  prompt_lang: 'de',
  lang: null,
  source_excerpt: null,
};

type Ask = 'none' | 'vertices' | 'edges' | 'faces' | 'volume' | 'surface' | 'kind';

/** A solid in cm; every measure it does not use is 0. `more`: its base or its net (#368). */
export const solid = (
  k: string,
  m: { n?: number; a?: number; b?: number; h?: number; r?: number },
  ask: Ask,
  more: { g?: Array<{ x: number; y: number }>; w?: 'oblique' | 'net' } = {},
) => ({
  type: 'solid',
  k,
  n: 0,
  a: 0,
  b: 0,
  h: 0,
  r: 0,
  u: 'cm',
  g: [],
  w: 'oblique',
  ...m,
  ask,
  ...more,
});

/** A lying prism with this base (its front face, in cm) and this length. */
export const lying = (g: Array<[number, number]>, h: number, ask: Ask) =>
  solid('prism', { n: g.length, h }, ask, { g: g.map(([x, y]) => ({ x, y })) });

/** A Würfelgebäude: heights row by row from the front (#368). */
export const cubes = (
  g: number[][],
  v: 'oblique' | 'plan' | 'front' | 'side' | 'top',
  ask: 'none' | 'count' | 'front' | 'side' | 'top' = 'none',
) => ({ type: 'cubes', g, v, ask });

/** The building of the view question: 2 1 0 in front, 3 2 1 behind. */
export const STAIRS = [
  [2, 1, 0],
  [3, 2, 1],
];

/** Front views as options: B is the building's (3, 2, 1 high from the left). */
export const VIEW_OPTIONS = [
  cubes([[1, 1, 1]], 'front'),
  cubes([[3, 2, 1]], 'front'),
  cubes([[1, 2, 3]], 'front'),
  cubes([[2, 2, 2]], 'front'),
];

/** Side views as options: B is the building's (2 high in front, 3 behind). */
const SIDE_OPTIONS = [
  cubes([[3], [2]], 'side'),
  cubes([[2], [3]], 'side'),
  cubes([[1], [1]], 'side'),
  cubes([[3], [3]], 'side'),
];

/** Top views as options: C is the building's (the front row's right column empty). */
const TOP_OPTIONS = [
  cubes(
    [
      [1, 1, 1],
      [1, 1, 0],
    ],
    'top',
  ),
  cubes(
    [
      [1, 1, 1],
      [1, 1, 1],
    ],
    'top',
  ),
  cubes(
    [
      [1, 1, 0],
      [1, 1, 1],
    ],
    'top',
  ),
  cubes(
    [
      [0, 1, 1],
      [1, 1, 1],
    ],
    'top',
  ),
];

/** An L standing on its foot (4 × 1) with its arm (1 × 3) on the left: 6 cm² (#418). */
const L_BASE: Array<[number, number]> = [
  [0, 0],
  [4, 0],
  [4, 1],
  [1, 1],
  [1, 3],
  [0, 3],
];

/** A house 8 wide, walls 3 high, the ridge at 6: roof sides 5, 36 cm² (#418). */
const HOUSE_BASE: Array<[number, number]> = [
  [0, 0],
  [8, 0],
  [8, 3],
  [4, 6],
  [0, 3],
];

/** Six squares drawn as text rows ("#" = a square), in reading order. */
export const net = (rows: string[], ask: 'none' | 'fold' | 'opposite' = 'none', at = 0) => ({
  type: 'cube_net',
  c: rows.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '#' ? [{ x, y }] : []))),
  ask,
  at,
});

/** A(2|3|2) and B(1|4|3), with the arrow from A to B. */
export const space = (ask: 'none' | 'point' | 'vector' | 'distance', i = 0, j = 0) => ({
  type: 'axes3d',
  p: [
    { l: 'A', x: 2, y: 3, z: 2 },
    { l: 'B', x: 1, y: 4, z: 3 },
  ],
  v: ask === 'point' ? [] : [{ a: 0, b: 1 }],
  ask,
  i,
  j,
});

/** The 2-3-1 net: folds. The other three do not (a 2 × 2 block, a 3-2-1 stair, a 2 × 3 block). */
export const NET_OPTIONS = [
  net(['.##.', '##..', '.##.']),
  net(['##..', '.###', '..#.']),
  net(['###.', '..##', '...#']),
  net(['##', '##', '##']),
];

/** The questions, in the order the walkthrough answers them. */
export const SOLID_ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist das Volumen dieses Quaders?',
    answer: '30',
    unit: 'cm³',
    topic: 'Körper',
    figure: solid('cuboid', { a: 5, b: 3, h: 2 }, 'volume'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Kanten hat dieses Prisma?',
    answer: '18',
    topic: 'Körper',
    figure: solid('prism', { n: 6, a: 2, h: 4 }, 'edges'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Berechne das Volumen der Pyramide.',
    answer: '48',
    unit: 'cm³',
    topic: 'Körper',
    figure: solid('pyramid', { n: 4, a: 6, h: 4 }, 'volume'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist die Oberfläche des Zylinders? Runde auf eine Nachkommastelle.',
    answer: '150,8',
    unit: 'cm²',
    topic: 'Körper',
    figure: solid('cylinder', { r: 3, h: 5 }, 'surface'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Berechne das Volumen des Kegels. Runde auf eine Nachkommastelle.',
    answer: '75,4',
    unit: 'cm³',
    topic: 'Körper',
    figure: solid('cone', { r: 3, h: 8 }, 'volume'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist das Volumen der Kugel? Runde auf eine Nachkommastelle.',
    answer: '113,1',
    unit: 'cm³',
    topic: 'Körper',
    figure: solid('sphere', { r: 3 }, 'volume'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Lässt sich dieses Netz zu einem Würfel falten?',
    answer: 'Ja',
    choices: ['Ja', 'Nein'],
    correct_choice: 0,
    topic: 'Würfelnetze',
    figure: net(['.#..', '####', '.#..'], 'fold'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Welches Quadrat liegt beim gefalteten Würfel gegenüber von Quadrat 2?',
    answer: '5',
    topic: 'Würfelnetze',
    figure: net(['###..', '..###'], 'opposite', 1),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welches dieser Netze ist ein Würfelnetz?',
    answer: 'Netz B',
    choices: ['Netz A', 'Netz B', 'Netz C', 'Netz D'],
    correct_choice: 1,
    choice_figures: NET_OPTIONS,
    topic: 'Würfelnetze',
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Welche Koordinaten hat der Punkt A?',
    answer: '(2|3|2)',
    topic: 'Raumgeometrie',
    figure: space('point', 0),
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Gib den Vektor von A nach B an.',
    answer: '(-1|1|1)',
    topic: 'Raumgeometrie',
    figure: space('vector', 0, 1),
  },
];

/**
 * The rest of #255 (#368): a prism with a non-regular base, nets of other solids, Würfelgebäude
 * and their views — in the order the walkthrough answers them.
 */
export const MORE_SOLID_ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Berechne das Volumen des Prismas mit trapezförmiger Grundfläche.',
    answer: '60',
    unit: 'cm³',
    topic: 'Körper',
    figure: lying(
      [
        [0, 0],
        [6, 0],
        [4, 3],
        [2, 3],
      ],
      5,
      'volume',
    ),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist die Oberfläche des Dreiecksprismas?',
    answer: '132',
    unit: 'cm²',
    topic: 'Körper',
    figure: lying(
      [
        [0, 0],
        [4, 0],
        [0, 3],
      ],
      10,
      'surface',
    ),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Berechne das Volumen des Prismas mit L-förmiger Grundfläche.',
    answer: '30',
    unit: 'cm³',
    topic: 'Körper',
    figure: lying(L_BASE, 5, 'volume'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist die Oberfläche des Prismas mit hausförmiger Grundfläche?',
    answer: '168',
    unit: 'cm²',
    topic: 'Körper',
    figure: lying(HOUSE_BASE, 4, 'surface'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welcher Körper entsteht, wenn man dieses Netz faltet?',
    answer: 'Quader',
    choices: ['Quader', 'Prisma', 'Pyramide', 'Zylinder'],
    correct_choice: 0,
    topic: 'Netze',
    figure: solid('cuboid', { a: 5, b: 3, h: 2 }, 'kind', { w: 'net' }),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Zu welchem Körper lässt sich dieses Netz falten?',
    answer: 'Kegel',
    // Code writes the options and marks the right one; the model only names the solid (#418).
    choices: ['Prisma', 'Pyramide', 'Zylinder', 'Kegel'],
    correct_choice: 0,
    topic: 'Netze',
    figure: solid('cone', { r: 3, h: 4 }, 'kind', { w: 'net' }),
  },
  {
    ...base,
    kind: 'numeric',
    prompt:
      'Berechne die Oberfläche des Zylinders aus seinem Netz. Runde auf zwei Nachkommastellen.',
    answer: '87,96',
    unit: 'cm²',
    topic: 'Netze',
    figure: solid('cylinder', { r: 2, h: 5 }, 'surface', { w: 'net' }),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Aus wie vielen Würfeln besteht das Gebäude?',
    answer: '9',
    topic: 'Würfelgebäude',
    figure: cubes(STAIRS, 'oblique', 'count'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Würfel braucht man für diesen Bauplan?',
    answer: '8',
    topic: 'Würfelgebäude',
    figure: cubes(
      [
        [1, 2, 0],
        [3, 0, 2],
      ],
      'plan',
      'count',
    ),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Ansicht von vorn gehört zu dem Gebäude?',
    answer: 'Ansicht B',
    choices: ['Ansicht A', 'Ansicht B', 'Ansicht C', 'Ansicht D'],
    correct_choice: 1,
    choice_figures: VIEW_OPTIONS,
    topic: 'Würfelgebäude',
    figure: cubes(STAIRS, 'oblique', 'front'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Ansicht von links gehört zu dem Gebäude?',
    answer: 'Ansicht B',
    choices: ['Ansicht A', 'Ansicht B', 'Ansicht C', 'Ansicht D'],
    correct_choice: 1,
    choice_figures: SIDE_OPTIONS,
    topic: 'Würfelgebäude',
    figure: cubes(STAIRS, 'oblique', 'side'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Ansicht von oben gehört zu dem Gebäude?',
    answer: 'Ansicht C',
    choices: ['Ansicht A', 'Ansicht B', 'Ansicht C', 'Ansicht D'],
    correct_choice: 2,
    choice_figures: TOP_OPTIONS,
    topic: 'Würfelgebäude',
    figure: cubes(STAIRS, 'oblique', 'top'),
  },
];

export function scriptSolids(): void {
  scriptGenerations({
    when: /Prismen, Körpernetze und Würfelgebäude/i,
    answer: () => ({
      usable: true,
      title: 'Netze und Würfelgebäude',
      subject: { name: 'Mathe', kind: 'math' },
      items: MORE_SOLID_ITEMS,
    }),
  });
  scriptTurns({
    when: /netze und würfelgebäude üben/i,
    answer: says('Gern – Prismen, Netze und Würfelgebäude.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Prismen, Körpernetze und Würfelgebäude' },
      },
    ]),
  });
  scriptGenerations({
    when: /Körper, Würfelnetze und Raumgeometrie/i,
    answer: () => ({
      usable: true,
      title: 'Körper und Raum',
      subject: { name: 'Mathe', kind: 'math' },
      items: SOLID_ITEMS,
    }),
  });
  scriptTurns({
    when: /körper üben/i,
    answer: says('Gern – Körper, Netze und Punkte im Raum.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Körper, Würfelnetze und Raumgeometrie' },
      },
    ]),
  });
}
