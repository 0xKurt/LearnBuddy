// requires live verification in Claude Code session (local device fixtures, no paid model)
import { scriptTurns, says } from '../../src/testing/scenarios/turns.js';
import { scriptGenerations } from '../../src/testing/scenarios/generations.js';

scriptTurns(
  { when: /^Erklaer mir Brueche$/, answer: says('Ein Bruch beschreibt einen Teil eines Ganzen.') },
  {
    when: /^Ich will Brueche ueben$/,
    answer: says('Hier kannst du Brüche üben.', [
      {
        tool: 'offer_learning',
        args: {
          kind: 'practice',
          text: 'Brueche ueben',
          goal: null,
          asked: 'Ich will Brueche ueben',
        },
      },
    ]),
  },
);
scriptGenerations({
  when: /LEARNER'S TEXT:\nBrueche ueben/,
  answer: () => ({
    usable: true,
    title: 'Brüche',
    subject: { name: 'Mathe', kind: 'math' },
    items: [
      {
        kind: 'short',
        prompt: 'Wie heißt die Zahl unter dem Bruchstrich?',
        answer: 'Nenner',
        accepted_answers: [],
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Brüche',
        difficulty: 1,
        prompt_lang: null,
        lang: null,
        figure: null,
        source_excerpt: null,
      },
    ],
  }),
});
await import('../../src/testing/dev-stack.js');
