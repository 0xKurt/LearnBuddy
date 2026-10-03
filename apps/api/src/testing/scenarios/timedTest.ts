// Scripted model answers for the walkthrough of a practice test with time (tests/web/modes.spec.ts,
// issue #241): Buddy offers it with minutes only because she asked for time, and the generator
// writes three questions, so one is still open when the time runs out. Registered BEFORE the
// learning modes: their "probetest" sentence would answer hers too.
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { base } from './learning-modes.js';
import { says, scriptTurns } from './turns.js';

export function scriptTimedTest(): void {
  scriptTurns({
    // Only because she asked for time does the offer carry minutes (issue #241).
    when: /photosynthese mit zeit/i,
    answer: says('Klar – ein Probetest zur Photosynthese mit 10 Minuten, wie in der Arbeit.', [
      {
        tool: 'offer_learning',
        args: {
          kind: 'test',
          text: 'Photosynthese',
          time_limit: { minutes: '10', quote: 'mit Zeit, wie in der Arbeit' },
        },
      },
    ]),
  });
  // A practice test she asked to sit with time (issue #241): three questions, so one is still
  // open when the time runs out and the result can say "nicht beantwortet".
  scriptGenerations({
    when: /Photosynthese/i,
    answer: () => ({
      usable: true,
      title: 'Photosynthese – Probetest',
      subject: { name: 'Biologie', kind: 'biology' },
      items: [
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Welches Gas nehmen Pflanzen bei der Photosynthese auf?',
          answer: 'Kohlenstoffdioxid',
          choices: ['Sauerstoff', 'Kohlenstoffdioxid', 'Stickstoff'],
          correct_choice: 1,
          topic: 'Photosynthese',
        },
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Wo in der Zelle findet die Photosynthese statt?',
          answer: 'In den Chloroplasten',
          choices: ['Im Zellkern', 'In den Chloroplasten', 'In der Zellwand'],
          correct_choice: 1,
          topic: 'Photosynthese',
        },
        {
          ...base,
          kind: 'multiple_choice',
          prompt: 'Was entsteht bei der Photosynthese außer Sauerstoff?',
          answer: 'Traubenzucker',
          choices: ['Traubenzucker', 'Wasser', 'Stärke'],
          correct_choice: 0,
          topic: 'Photosynthese',
        },
      ],
    }),
  });
}
