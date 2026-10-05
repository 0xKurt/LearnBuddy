// Scripted model answers for the browser walkthrough of circuits, logic gates and Itten's colour
// wheel (tests/web/circuits.spec.ts, issue #261): two lamps in parallel with a switch open, two
// resistors in series with an ammeter, a mixed circuit, a logic net and the wheel. Every figure
// here passes the server's own checks (`modules/practice/circuitCheck.ts`, `colorCheck.ts`) —
// the walkthrough sees what a learner would. The integration test (`circuits.int.test.ts`) uses
// the same figures.
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

const lamp = (r = 0) => ({ k: 'lamp', r, o: false });
const resistor = (r: number) => ({ k: 'resistor', r, o: false });
const toggle = (open: boolean) => ({ k: 'switch', r: 0, o: open });

/** Two lamps in parallel, each behind its own switch; S2 is open. */
export const parallelLamps = (ask: 'lit' | 'kind' | 'lit_count' = 'lit', at = 'L2') => ({
  type: 'circuit',
  u: 4.5,
  b: [
    [
      [lamp(), toggle(false)],
      [lamp(), toggle(true)],
    ],
  ],
  m: 'none',
  mt: '',
  ask,
  at: ask === 'lit' ? at : '',
});

/** 12 V over 100 Ω and 200 Ω in series, an ammeter in the main wire: 0,04 A. */
export const seriesMeter = {
  type: 'circuit',
  u: 12,
  b: [[[resistor(100)]], [[resistor(200)]]],
  m: 'ammeter',
  mt: '',
  ask: 'current',
  at: '',
};

/** R1 = 100 Ω before R2 ∥ R3 (200 Ω each): 200 Ω in all. */
export const mixedResistors = {
  type: 'circuit',
  u: 0,
  b: [[[resistor(100)]], [[resistor(200)], [resistor(200)]]],
  m: 'none',
  mt: '',
  ask: 'r_total',
  at: '',
};

/** Q = (A ∧ B) ∨ ¬C, the classic first net with three inputs. */
export const logicNet = (ask: 'out' | 'ones', v: number[] = []) => ({
  type: 'logic',
  g: [
    { o: 'and', a: 'A', b: 'B' },
    { o: 'not', a: 'C', b: '' },
    { o: 'or', a: 'G1', b: 'G2' },
  ],
  ask,
  v,
});

/** Itten's wheel, red marked: its complement is green. */
export const wheelComplement = {
  type: 'color_wheel',
  hl: ['red'],
  ask: 'complement',
  at: ['red'],
};

/** Blue and yellow mix to green; the three secondaries are marked as the options. */
const wheelMix = {
  type: 'color_wheel',
  hl: ['orange', 'violet', 'green'],
  ask: 'mix',
  at: ['blue', 'yellow'],
};

/** The questions, in the order the walkthrough answers them. */
export const CIRCUIT_ITEMS = [
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Der Schalter S2 ist offen. Leuchtet die Lampe L2?',
    answer: 'leuchtet nicht',
    choices: ['leuchtet', 'leuchtet nicht'],
    correct_choice: 1,
    topic: 'Stromkreise',
    figure: parallelLamps('lit', 'L2'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Welche Stromstärke zeigt das Amperemeter an?',
    answer: '0.04',
    unit: 'A',
    topic: 'Ohmsches Gesetz',
    figure: seriesMeter,
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie groß ist der Ersatzwiderstand der ganzen Schaltung?',
    answer: '200',
    unit: 'Ω',
    topic: 'Ersatzwiderstand',
    figure: mixedResistors,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welchen Wert hat Q für A = 1, B = 1 und C = 1?',
    answer: '1',
    choices: ['0', '1'],
    correct_choice: 1,
    topic: 'Logikgatter',
    figure: logicNet('out', [1, 1, 1]),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'In wie vielen Zeilen der Wahrheitstabelle ist Q = 1?',
    answer: '5',
    topic: 'Logikgatter',
    figure: logicNet('ones'),
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Welche Farbe ist im Farbkreis die Komplementärfarbe von Rot?',
    answer: 'Grün',
    topic: 'Farbkreis',
    figure: wheelComplement,
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche markierte Farbe entsteht, wenn du Blau und Gelb mischst?',
    answer: 'Grün',
    choices: ['Orange', 'Violett', 'Grün'],
    correct_choice: 2,
    topic: 'Farbkreis',
    figure: wheelMix,
  },
];

export function scriptCircuits(): void {
  scriptGenerations({
    when: /Stromkreise, Logikgatter und der Farbkreis/i,
    answer: () => ({
      usable: true,
      title: 'Schaltungen und Farben',
      subject: { name: 'Physik', kind: 'physics' },
      items: CIRCUIT_ITEMS,
    }),
  });
  scriptTurns({
    when: /schaltpläne üben/i,
    answer: says('Gern – Schaltpläne, Gatter und Farben.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Stromkreise, Logikgatter und der Farbkreis' },
      },
    ]),
  });
}
