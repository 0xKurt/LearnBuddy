// Scripted model answers for the browser walkthrough of several right answers (issue #240,
// tests/web/modes.spec.ts "mehrere richtige ankreuzen"). Its own learner sentences, so no other
// spec shifts these answers (#313). Test tooling only; answers are keyed by the learner's text.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)
//
// The model writes the options and marks the right ones; the server checks the set (Regel 0: at
// least two right, one wrong, no two alike), shuffles, names and keeps the key. Both cases are the
// LARGEST a select-all may be (contracts/structured.ts), so the walkthrough measures the worst case
// on 360×740 (rule 16): six short Latin cases two by two, and four statements of up to
// SELECT_OPTION_MAX characters one under the other below a two-line question.

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptSelectAll(): void {
  scriptTurns(
    {
      when: /fälle in latein/i,
      answer: says('Gern – kreuz an, was alles passt.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Fälle in Latein bestimmen' } },
      ]),
    },
    {
      when: /fahrradprüfung/i,
      answer: says('Klar – hier ist eine Frage wie in der Fahrradprüfung.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Fahrradprüfung üben' } },
      ]),
    },
  );
  scriptGenerations({
    when: /LEARNER'S TEXT:\n[^\n]*Fälle in Latein/i,
    answer: () => ({
      usable: true,
      title: 'a-Deklination',
      subject: { name: 'Latein', kind: 'latin' },
      items: [],
      structured: [
        {
          type: 'select_all',
          prompt: 'Welche Fälle kann „rosae“ sein?',
          options: [
            { text: 'Genitiv', correct: true },
            { text: 'Dativ', correct: true },
            { text: 'Nominativ', correct: true },
            { text: 'Vokativ', correct: true },
            { text: 'Akkusativ', correct: false },
            { text: 'Ablativ', correct: false },
          ],
          topic: 'a-Deklination',
          difficulty: 2,
          prompt_lang: 'de',
        },
      ],
    }),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\n[^\n]*Fahrradprüfung/i,
    answer: () => ({
      usable: true,
      title: 'Fahrradprüfung',
      subject: { name: 'Sachunterricht', kind: 'other' },
      items: [],
      structured: [
        {
          type: 'select_all',
          prompt: 'Was muss ein Fahrrad für die Straße unbedingt haben?',
          options: [
            { text: 'Zwei unabhängige Bremsen', correct: true },
            { text: 'Ein weißer Scheinwerfer vorn', correct: true },
            { text: 'Ein Gepäckträger mit Gurt', correct: false },
            { text: 'Rückstrahler an den Pedalen', correct: true },
          ],
          topic: 'Verkehrssicheres Fahrrad',
          difficulty: 1,
          prompt_lang: 'de',
        },
      ],
    }),
  });
}
