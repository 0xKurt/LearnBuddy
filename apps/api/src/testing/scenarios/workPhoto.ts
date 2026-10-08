// Scripted model answers for her photographed working (issue #444, tests/web/work-photo.spec.ts):
// she asks Buddy to practise equations she works out in her exercise book, Buddy offers a run, and
// the photo of her working is copied down with one line the reading could not settle. Everything
// after that — the empty line, "Prüfen" waiting, the step check — is code. Its own learner
// sentence and its own question, so no other spec shifts these answers (#313).
// Test tooling only; answers are keyed by the learner's text and the question, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { base } from './learning-modes.js';
import { transcribeRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

/** The question her photographed working answers. */
const WORK_QUESTION = 'Löse die Gleichung 2x + 3 = 7.';

export function scriptWorkPhoto(): void {
  scriptTurns({
    when: /rechenweg aus dem heft fotografieren/i,
    answer: says('Gern – rechne im Heft und fotografier mir deinen Weg.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Gleichungen im Heft lösen' } },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nGleichungen im Heft lösen/,
    answer: () => ({
      usable: true,
      title: 'Gleichungen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          ...base,
          kind: 'numeric',
          prompt: WORK_QUESTION,
          answer: '2',
          prompt_lang: 'de',
          topic: 'Gleichungen',
        },
      ],
    }),
  });
  // Her notebook, as the reading copies it: the step notes as written, the middle line not
  // settled — so it comes back empty, and she writes it herself.
  transcribeRules.add({
    when: /Löse die Gleichung 2x \+ 3 = 7/,
    system: /handwritten working/,
    answer: () => ({
      found: 'working',
      lines: [
        { text: '2x + 3 = 7 | −3', readable: true },
        { text: '', readable: false },
        { text: 'x = 2,5', readable: true },
      ],
    }),
  });
}
