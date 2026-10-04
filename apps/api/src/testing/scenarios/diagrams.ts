// Scripted model answers for the browser walkthrough of diagrams (tests/web/diagrams.spec.ts,
// issue #247): a Wasserkreislauf with two gaps, a Nahrungskette as a word bank, the
// Gewaltenteilung as a tree and a Regelkreis on a grid. Every figure here passes the server's own
// checks (`modules/practice/diagramCheck.ts`) — the walkthrough sees what a learner would. The
// integration test (`diagrams.int.test.ts`) uses the same figures.
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

const arrow = (a: number, b: number, l = '') => ({ a, b, l });

/** The water cycle, clockwise from the top left; gaps A (Kondensation) and B (Abfluss). */
export const waterCycle = {
  type: 'diagram',
  k: 'cycle',
  n: ['Verdunstung', '?', 'Niederschlag', '?'],
  e: [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 0)],
  g: [],
};

/** Gras → ? → Fuchs → Adler, each arrow "wird gefressen von". */
export const foodChain = {
  type: 'diagram',
  k: 'chain',
  n: ['Gras', '?', 'Fuchs', 'Adler'],
  e: [arrow(0, 1), arrow(1, 2), arrow(2, 3)],
  g: [],
};

/** The separation of powers: one root, three branches, the executive a gap. */
const powers = {
  type: 'diagram',
  k: 'tree',
  n: ['Staatsgewalt', 'Legislative', '?', 'Judikative'],
  e: [arrow(0, 1), arrow(0, 2), arrow(0, 3)],
  g: [],
};

/** A control loop on a 2 × 3 grid: the sensor reports the actual value back to the controller. */
export const controlLoop = {
  type: 'diagram',
  k: 'free',
  n: ['Sollwert', 'Regler', '?', 'Regelstrecke', 'Messfühler'],
  e: [arrow(0, 1), arrow(1, 2), arrow(2, 3), arrow(3, 4), arrow(4, 1, 'Istwert')],
  g: [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 1, r: 1 },
    { c: 1, r: 2 },
    { c: 0, r: 1 },
  ],
};

/** The questions, in the order the walkthrough answers them. */
export const DIAGRAM_ITEMS = [
  {
    ...base,
    kind: 'short',
    prompt: 'Was gehört im Wasserkreislauf in Lücke A?',
    answer: 'Kondensation',
    accepted_answers: ['Wolkenbildung'],
    topic: 'Wasserkreislauf',
    figure: waterCycle,
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Was gehört im Wasserkreislauf in Lücke B?',
    answer: 'Abfluss',
    accepted_answers: ['Versickerung'],
    topic: 'Wasserkreislauf',
    figure: waterCycle,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welches Tier gehört in Lücke A der Nahrungskette?',
    answer: 'Hase',
    choices: ['Hase', 'Hai', 'Löwe'],
    correct_choice: 0,
    topic: 'Nahrungsketten',
    figure: foodChain,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Gewalt fehlt in Lücke A?',
    answer: 'Exekutive',
    choices: ['Opposition', 'Exekutive', 'Presse'],
    correct_choice: 1,
    topic: 'Gewaltenteilung',
    figure: powers,
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Was gehört im Regelkreis in Lücke A?',
    answer: 'Stellglied',
    topic: 'Regelkreis',
    figure: controlLoop,
  },
];

export function scriptDiagrams(): void {
  scriptGenerations({
    when: /Kreisläufe, Ketten und Regelkreise/i,
    answer: () => ({
      usable: true,
      title: 'Schemata',
      subject: { name: 'Biologie', kind: 'biology' },
      items: DIAGRAM_ITEMS,
    }),
  });
  scriptTurns({
    when: /schemata üben/i,
    answer: says('Gern – Schemata mit Lücken.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Kreisläufe, Ketten und Regelkreise' },
      },
    ]),
  });
}
