// Scripted model answers for the browser walkthrough of the primary-school figures
// (tests/web/primary-figures.spec.ts, issue #254): a clock to read, two clocks for a span, coins
// and notes to count, a Zwanzigerfeld, a Hunderterfeld, base-ten blocks and clocks as the options of a multiple
// choice. Every figure and key here passes the server's own checks
// (`modules/practice/figureCheck.ts`) — the walkthrough sees what a learner would.
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const base = {
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 1,
  prompt_lang: 'de',
  lang: null,
  source_excerpt: null,
};

const clock = (h: number, m: number) => ({
  type: 'clock',
  c: [{ h, m }],
  h24: false,
  ask: 'time',
});

/** The questions, in the order the walkthrough answers them. */
export const PRIMARY_ITEMS = [
  {
    ...base,
    kind: 'short',
    prompt: 'Wie spät ist es?',
    answer: '7:45',
    topic: 'Uhr lesen',
    figure: clock(7, 45),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Minuten vergehen von der ersten bis zur zweiten Uhr?',
    answer: '45',
    unit: 'min',
    topic: 'Zeitspannen',
    figure: {
      type: 'clock',
      c: [
        { h: 7, m: 45 },
        { h: 8, m: 30 },
      ],
      h24: false,
      ask: 'span',
    },
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viel Geld ist das?',
    answer: '8.45',
    unit: '€',
    topic: 'Geld zählen',
    figure: {
      type: 'money',
      p: [
        { d: '5€', n: 1 },
        { d: '2€', n: 1 },
        { d: '1€', n: 1 },
        { d: '20ct', n: 2 },
        { d: '5ct', n: 1 },
      ],
      ask: 'sum',
    },
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Plättchen sind es zusammen?',
    answer: '14',
    topic: 'Zehnerübergang',
    figure: { type: 'dot_field', field: 'twenty', n: [8, 6], ask: 'count' },
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Punkte sind gefärbt?',
    answer: '37',
    topic: 'Hunderterfeld',
    figure: { type: 'dot_field', field: 'hundred', n: [37], ask: 'count' },
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Welche Zahl ist das?',
    answer: '234',
    topic: 'Stellenwerte',
    figure: { type: 'base_ten', h: 2, t: 3, o: 4, ask: 'count' },
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welche Uhr zeigt halb drei?',
    answer: '2:30',
    choices: ['2:30', '6:15', '3:30', '8:45'],
    correct_choice: 0,
    topic: 'Uhr lesen',
    choice_figures: [clock(2, 30), clock(6, 15), clock(3, 30), clock(8, 45)],
  },
];

export function scriptPrimary(): void {
  scriptGenerations({
    when: /Uhr, Geld und Plättchen/i,
    answer: () => ({
      usable: true,
      title: 'Uhr, Geld und Plättchen',
      subject: { name: 'Mathe', kind: 'math' },
      items: PRIMARY_ITEMS,
    }),
  });
  scriptTurns({
    when: /uhr und geld üben/i,
    answer: says('Gern – Uhr, Geld und Plättchen, alles zum Ablesen.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Uhr, Geld und Plättchen' } },
    ]),
  });
}
