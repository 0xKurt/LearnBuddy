// Scripted model answers for the browser walkthrough of figures that state numbers
// (tests/web/figures.spec.ts, issues #253 and #257): angles, sides, forces and light drawn to
// scale, and structural formulas from atoms and bonds. Every figure here passes the server's
// own checks (`modules/practice/figureCheck.ts`) — the walkthrough sees what a learner would.
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

const rad = (d: number) => (d * Math.PI) / 180;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const none = { segments: [], polygons: [], circles: [] };

/** A triangle with 50° at A and 60° at B on AB = 6: the model computes its third corner. */
function angleSum() {
  const ac = (6 * Math.sin(rad(60))) / Math.sin(rad(70));
  return {
    type: 'geometry',
    ...none,
    points: [
      { name: 'A', x: 0, y: 0 },
      { name: 'B', x: 6, y: 0 },
      { name: 'C', x: r3(ac * Math.cos(rad(50))), y: r3(ac * Math.sin(rad(50))) },
    ],
    polygons: [['A', 'B', 'C']],
    angles: [
      { at: ['B', 'A', 'C'], deg: 50, label: null },
      { at: ['A', 'B', 'C'], deg: 60, label: null },
      { at: ['A', 'C', 'B'], deg: null, label: '?' },
    ],
  };
}

const pythagoras = {
  type: 'geometry',
  ...none,
  points: [
    { name: 'A', x: 0, y: 0 },
    { name: 'B', x: 4, y: 0 },
    { name: 'C', x: 4, y: 3 },
  ],
  polygons: [['A', 'B', 'C']],
  angles: [{ at: ['A', 'B', 'C'], deg: 90, label: null }],
  lengths: [
    { from: 'A', to: 'B', value: 4, label: '4 cm' },
    { from: 'B', to: 'C', value: 3, label: '3 cm' },
    { from: 'A', to: 'C', value: null, label: '?' },
  ],
};

const forces = {
  type: 'geometry',
  ...none,
  points: [
    { name: 'P', x: 0, y: 0 },
    { name: 'Q', x: 3, y: 0 },
    { name: 'S', x: 0, y: 4 },
    { name: 'R', x: 3, y: 4 },
  ],
  arrows: [
    { from: 'P', to: 'Q', value: 30, label: 'F₁ = 30 N', resultant: false },
    { from: 'P', to: 'S', value: 40, label: 'F₂ = 40 N', resultant: false },
    { from: 'P', to: 'R', value: null, label: '?', resultant: true },
  ],
};

const s40 = r3(3.5 * Math.sin(rad(40)));
const c40 = r3(3.5 * Math.cos(rad(40)));
const reflection = {
  type: 'geometry',
  ...none,
  points: [
    { name: 'L', x: -4, y: 0 },
    { name: 'K', x: 4, y: 0 },
    { name: 'M', x: 0, y: 0 },
    { name: 'N', x: 0, y: 3.6 },
    { name: 'S', x: -s40, y: c40 },
    { name: 'T', x: s40, y: c40 },
  ],
  lines: [
    { a: 'L', b: 'K', label: 'Spiegel' },
    { a: 'M', b: 'N', label: 'Lot' },
  ],
  rays: [
    { from: 'S', through: 'M', kind: 'light_in' },
    { from: 'M', through: 'T', kind: 'light' },
  ],
  angles: [
    { at: ['S', 'M', 'N'], deg: 40, label: null },
    { at: ['N', 'M', 'T'], deg: null, label: '?' },
  ],
};

const atom = (id: string, el: string, h = 0, charge = 0) => ({ id, el, h, charge });
const bond = (a: string, b: string, order = 1) => ({ a, b, order });

const water = {
  type: 'molecule',
  style: 'lewis',
  atoms: [atom('a1', 'O', 2)],
  bonds: [],
  ask: 'lone_pairs',
};

const ethanol = {
  type: 'molecule',
  style: 'structural',
  atoms: [atom('a1', 'C', 3), atom('a2', 'C', 2), atom('a3', 'O', 1)],
  bonds: [bond('a1', 'a2'), bond('a2', 'a3')],
  mark: ['a3'],
};

const propan2ol = {
  type: 'molecule',
  style: 'skeletal',
  atoms: [atom('a1', 'C', 3), atom('a2', 'C', 1), atom('a3', 'C', 3), atom('a4', 'O', 1)],
  bonds: [bond('a1', 'a2'), bond('a2', 'a3'), bond('a2', 'a4')],
  ask: 'formula',
};

const ammonium = {
  type: 'molecule',
  style: 'structural',
  atoms: [atom('a1', 'N', 4, 1)],
  bonds: [],
};

/** The eight questions, in the order the walkthrough answers them. */
export const FIGURE_ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist der Winkel bei C?',
    answer: '70',
    unit: '°',
    topic: 'Winkelsumme',
    figure: angleSum(),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie lang ist die Seite AC?',
    answer: '5',
    unit: 'cm',
    topic: 'Pythagoras',
    figure: pythagoras,
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist die resultierende Kraft?',
    answer: '50',
    unit: 'N',
    topic: 'Kräfte addieren',
    figure: forces,
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Unter welchem Winkel zum Lot wird das Licht reflektiert?',
    answer: '40',
    unit: '°',
    topic: 'Reflexion',
    figure: reflection,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Wie viele freie Elektronenpaare hat das Sauerstoffatom?',
    answer: '2',
    choices: ['1', '2', '3', '4'],
    correct_choice: 1,
    topic: 'Lewis-Formeln',
    figure: water,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Wie heißt die markierte funktionelle Gruppe?',
    answer: 'Hydroxygruppe',
    choices: ['Hydroxygruppe', 'Carboxygruppe', 'Aminogruppe'],
    correct_choice: 0,
    topic: 'Funktionelle Gruppen',
    figure: ethanol,
  },
  {
    ...base,
    kind: 'formula',
    prompt: 'Wie lautet die Summenformel dieses Moleküls?',
    answer: 'C3H8O',
    topic: 'Skelettformeln',
    figure: propan2ol,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Ladung hat dieses Teilchen?',
    answer: '+1',
    choices: ['+1', '0', '−1'],
    correct_choice: 0,
    topic: 'Ionen',
    figure: ammonium,
  },
];

export function scriptFigures(): void {
  scriptGenerations({
    when: /Winkel, Kräfte und Strukturformeln/i,
    answer: () => ({
      usable: true,
      title: 'Figuren zum Ablesen',
      subject: { name: 'Mathe', kind: 'math' },
      items: FIGURE_ITEMS,
    }),
  });
  scriptTurns({
    when: /figuren üben/i,
    answer: says('Gern – Winkel, Kräfte und Strukturformeln, alles zum Ablesen.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Winkel, Kräfte und Strukturformeln' },
      },
    ]),
  });
}
