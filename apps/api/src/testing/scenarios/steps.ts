// Scripted model answers for the browser shots of a guided worked example (issue #298,
// tests/web/steps.spec.ts): an equation whose way the hints call writes step by step, which code
// proves and turns into the „Tipp" ladder. Her own sentence ("Klammergleichungen"), which no other
// spec types, so no rule of another scenario answers it and it answers nothing else (#350).
// Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { base } from './learning-modes.js';
import { hintRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

const TASK = 'Löse die Gleichung 2(x + 3) = 14.';

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
        { ...base, kind: 'numeric', prompt: TASK, answer: '4', topic: 'Gleichungen' },
        {
          ...base,
          kind: 'numeric',
          prompt: 'Löse die Gleichung 3(x − 1) = 9.',
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
          worked_solution: 'Klammer auflösen, 6 abziehen, durch 2 teilen: x = 4.',
          why: null,
          steps: [
            { line: '2(x + 3) = 14', note: 'Die Gleichung' },
            { line: '2x + 6 = 14', note: 'Klammer auflösen' },
            { line: '2x = 8', note: 'Auf beiden Seiten 6 abziehen' },
            { line: 'x = 4', note: 'Durch 2 teilen' },
          ],
        },
      ],
    }),
  });
}
