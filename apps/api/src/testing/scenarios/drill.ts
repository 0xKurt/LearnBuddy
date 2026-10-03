// Scripted model answers for the Kopfrechnen walkthrough (tests/web/modes.spec.ts, issue #243):
// Buddy only picks the range from a closed list; code writes and checks every task, so no
// generation is scripted at all. Its own sentences, so no other spec shifts these (#313).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { says, scriptTurns } from './turns.js';

export function scriptDrill(): void {
  scriptTurns(
    {
      // Kopfrechnen (issue #243): Buddy only picks the range; code writes every task.
      when: /einmaleins/i,
      answer: says('Klar – eine schnelle Runde mit den 6ern und 7ern.', [
        { tool: 'offer_drill', args: { range: 'times', rows: [6, 7], carry: null } },
      ]),
    },
    {
      when: /brüche im kopf/i,
      answer: says('Gern – Brüche addieren, ganz schnell.', [
        { tool: 'offer_drill', args: { range: 'fractions', rows: null, carry: null } },
      ]),
    },
    {
      when: /plus bis 100/i,
      answer: says('Klar – Plus bis 100, ohne Übergang.', [
        { tool: 'offer_drill', args: { range: 'plus_100', rows: null, carry: 'without' } },
      ]),
    },
  );
}
