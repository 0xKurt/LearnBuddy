// Scripted model answers for the browser shots of a guided worked example (issue #298,
// tests/web/steps.spec.ts): an equation with a bracket whose way the hints call writes step by
// step, which code proves and turns into the „Tipp" ladder. Her own sentence
// ("Klammergleichungen"), which no other spec types, so no rule of another scenario answers it
// and it answers nothing else (#350); the same for her words asking for help ("Zeig mir, wie das
// geht").
// Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { base } from './learning-modes.js';
import { hintRules, tutorRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

const TASK = 'Löse 3(2x - 4) = 2x + 8.';

export function scriptSteps(): void {
  scriptTurns({
    // The same once more, as a new run (the walkthrough walks it again in the dark).
    when: /klammergleichungen wiederholen/i,
    answer: says('Gern – noch eine Runde, ich rechne dir wieder vor.', [
      {
        tool: 'offer_learning',
        args: { kind: 'practice', text: 'Klammergleichungen wiederholen' },
      },
    ]),
  });
  scriptTurns({
    when: /klammergleichungen/i,
    answer: says('Gern – ich rechne dir vor, und du machst mit.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Klammergleichungen' } },
    ]),
  });
  scriptGenerations({
    when: /Klammergleichungen/i,
    answer: () => ({
      usable: true,
      title: 'Klammergleichungen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        { ...base, kind: 'numeric', prompt: TASK, answer: '5', topic: 'Gleichungen' },
        {
          ...base,
          kind: 'numeric',
          prompt: 'Löse 3(x - 1) = 9.',
          answer: '4',
          topic: 'Gleichungen',
        },
      ],
    }),
  });
  hintRules.add({
    when: new RegExp(TASK.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    answer: () => ({
      items: [
        {
          n: 1,
          hints: ['Löse zuerst die Klammer auf.'],
          worked_solution: 'Klammer auflösen, 2x abziehen, 12 addieren, durch 4 teilen: x = 5.',
          why: null,
          steps: [
            { line: '3(2x - 4) = 2x + 8', note: 'Die Gleichung' },
            { line: '6x - 12 = 2x + 8', note: 'Klammer auflösen' },
            { line: '4x - 12 = 8', note: 'Auf beiden Seiten 2x abziehen' },
            { line: '4x = 20', note: '12 addieren' },
            { line: 'x = 5', note: 'Durch 4 teilen' },
          ],
        },
      ],
    }),
  });
  // „Zeig mir wie" in her words: the tutor reads a request for help. Its own words are never
  // shown — code puts the way's next step in their place (`workedSteps.ts` `stepOnRequest`).
  tutorRules.add({
    when: /Zeig mir, wie das geht/,
    answer: () => ({
      intent: 'help_request',
      verdict: 'not_an_attempt',
      reply: 'Klar, ich rechne dir den ersten Schritt vor.',
      gave_hint: true,
      revealed_answer: false,
    }),
  });
}
