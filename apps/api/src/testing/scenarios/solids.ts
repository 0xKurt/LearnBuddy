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

type Ask = 'none' | 'vertices' | 'edges' | 'faces' | 'volume' | 'surface';

/** A solid in cm; every measure it does not use is 0. */
export const solid = (
  k: string,
  m: { n?: number; a?: number; b?: number; h?: number; r?: number },
  ask: Ask,
) => ({ type: 'solid', k, n: 0, a: 0, b: 0, h: 0, r: 0, u: 'cm', ...m, ask });

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

export function scriptSolids(): void {
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
