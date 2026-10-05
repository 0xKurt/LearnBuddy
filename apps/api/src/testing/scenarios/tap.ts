// Scripted model answers for tapping inside a figure (issue #248): a place on a number line, a
// point of a coordinate system, a column of a bar chart and a clock face to set. Shared by the
// integration test (`__tests__/tap-figures.int.test.ts`) and the browser walkthrough
// (tests/web/tap-figures.spec.ts). Every key here lies on its figure's grid and passes the
// server's own check (`modules/practice/tapCheck.ts`) — the walkthrough sees what a learner would.
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
  tap: true,
};

/** The questions, in the order the walkthrough answers them. */
export const TAP_ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wo liegt 2,5 auf dem Zahlenstrahl? Tippe die Stelle an.',
    answer: '2.5',
    topic: 'Zahlenstrahl',
    figure: { type: 'number_line', min: 0, max: 5, step: 0.5, points: [] },
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Markiere den Punkt (2 | −1) im Koordinatensystem.',
    answer: '(2|-1)',
    topic: 'Koordinaten',
    figure: {
      type: 'function_plot',
      functions: [],
      x_min: -4,
      x_max: 4,
      y_min: -4,
      y_max: 4,
      points: [{ x: -3, y: 2, label: 'A' }],
    },
  },
  {
    ...base,
    kind: 'short',
    prompt: 'In welchem Monat hat es am meisten geregnet? Tippe die Säule an.',
    answer: 'Apr',
    unit: null,
    topic: 'Diagramme lesen',
    figure: {
      type: 'bar_chart',
      bars: [
        { label: 'Jan', value: 40 },
        { label: 'Feb', value: 35 },
        { label: 'Mär', value: 52 },
        { label: 'Apr', value: 61 },
        { label: 'Mai', value: 48 },
      ],
      unit: 'mm',
    },
  },
  {
    ...base,
    kind: 'short',
    prompt: 'Stell die Uhr auf Viertel vor acht.',
    answer: '7:45',
    topic: 'Uhr stellen',
    figure: { type: 'clock', c: [], h24: false, ask: 'none' },
  },
];

/** Tap questions that cannot be asked as written: none of them may reach the database. */
export const BROKEN_TAP_ITEMS = [
  // The key lies between two places of the line: nobody could tap 2,25 on half steps.
  { ...TAP_ITEMS[0]!, prompt: 'Wo liegt 2,25?', answer: '2.25' },
  // The line already marks the key: the tap would only copy it.
  {
    ...TAP_ITEMS[0]!,
    prompt: 'Wo liegt 3?',
    answer: '3',
    figure: { type: 'number_line', min: 0, max: 5, step: 0.5, points: [{ value: 3, label: 'P' }] },
  },
  // Too many places for a finger: 31 on one line.
  {
    ...TAP_ITEMS[0]!,
    prompt: 'Wo liegt 17?',
    answer: '17',
    figure: { type: 'number_line', min: 0, max: 30, step: 1, points: [] },
  },
  // A point outside the window.
  { ...TAP_ITEMS[1]!, prompt: 'Markiere den Punkt (6 | 1).', answer: '(6|1)' },
  // A column nobody drew.
  { ...TAP_ITEMS[2]!, prompt: 'Tippe den Juni an.', answer: 'Jun' },
  // A time between two five-minute marks.
  { ...TAP_ITEMS[3]!, prompt: 'Stell die Uhr auf 7:43.', answer: '7:43' },
  // A clock that already shows the time to set.
  {
    ...TAP_ITEMS[3]!,
    prompt: 'Stell die Uhr auf halb drei.',
    answer: '2:30',
    figure: { type: 'clock', c: [{ h: 2, m: 30 }], h24: false, ask: 'none' },
  },
  // A face without hands on a question that is typed: an empty clock beside a time question.
  { ...TAP_ITEMS[3]!, prompt: 'Wie spät ist es auf dieser Uhr?', tap: undefined },
  // Options are not tapped in a figure.
  {
    ...TAP_ITEMS[2]!,
    kind: 'multiple_choice',
    prompt: 'Welcher Monat war am nassesten?',
    choices: ['Mär', 'Apr'],
    correct_choice: 1,
  },
];

export function scriptTap(): void {
  scriptGenerations({
    when: /In die Figur tippen/i,
    answer: () => ({
      usable: true,
      title: 'In die Figur tippen',
      subject: { name: 'Mathe', kind: 'math' },
      items: TAP_ITEMS,
    }),
  });
  scriptTurns({
    when: /zahlenstrahl und uhr antippen/i,
    answer: says('Gern – heute tippst du direkt in die Bilder.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'In die Figur tippen' } },
    ]),
  });
}
