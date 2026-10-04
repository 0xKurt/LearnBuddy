// Scripted model answers for the browser walkthrough of the periodic table (tests/web/periodic.spec.ts,
// issue #250): the main-group table with a marked element, the class of an element, a trend
// between marked elements and the full table. Every figure here passes the server's own checks
// (`modules/practice/periodicCheck.ts`) — the walkthrough sees what a learner would. The
// integration test (`periodic.int.test.ts`) uses the same questions.
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
  topic: 'Periodensystem',
};

type Ask =
  | 'none'
  | 'protons'
  | 'electrons'
  | 'neutrons'
  | 'valence'
  | 'group'
  | 'period'
  | 'shells'
  | 'class'
  | 'en_max'
  | 'radius_max';

/** A periodic-table figure as the model writes it. */
export const table = (v: 'main' | 'full', hl: string[], ask: Ask = 'none', at = '') => ({
  type: 'periodic_table',
  v,
  hl,
  ask,
  at,
});

/** The questions, in the order the walkthrough answers them. */
export const PERIODIC_ITEMS = [
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Neutronen hat das markierte Element?',
    answer: '18',
    figure: table('main', ['Cl'], 'neutrons', 'Cl'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Valenzelektronen hat Schwefel?',
    answer: '6',
    figure: table('main', ['S'], 'valence', 'S'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Ist Silicium ein Metall, ein Halbmetall oder ein Nichtmetall?',
    answer: 'Halbmetall',
    choices: ['Metall', 'Halbmetall', 'Nichtmetall'],
    correct_choice: 1,
    figure: table('main', ['Si'], 'class', 'Si'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welches der markierten Elemente hat die größte Elektronegativität?',
    answer: 'Cl',
    choices: ['Na', 'Mg', 'Cl'],
    correct_choice: 2,
    figure: table('main', ['Na', 'Mg', 'Cl'], 'en_max'),
  },
  {
    ...base,
    kind: 'multiple_choice',
    prompt: 'Welches der markierten Elemente hat den größten Atomradius?',
    answer: 'K',
    choices: ['Li', 'Na', 'K'],
    correct_choice: 2,
    figure: table('main', ['Li', 'Na', 'K'], 'radius_max'),
  },
  {
    ...base,
    kind: 'numeric',
    prompt: 'Wie viele Protonen hat ein Eisenatom?',
    answer: '26',
    figure: table('full', ['Fe'], 'protons', 'Fe'),
  },
];

export function scriptPeriodic(): void {
  scriptGenerations({
    when: /Periodensystem: Atombau und Trends/i,
    answer: () => ({
      usable: true,
      title: 'Periodensystem',
      subject: { name: 'Chemie', kind: 'chemistry' },
      items: PERIODIC_ITEMS,
    }),
  });
  scriptTurns({
    when: /periodensystem üben/i,
    answer: says('Gern – wir lesen das Periodensystem.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Periodensystem: Atombau und Trends' },
      },
    ]),
  });
}
