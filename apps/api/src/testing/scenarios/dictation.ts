// Scripted model answers for the Diktat walkthrough (tests/web/dictation.spec.ts, issue #242):
// she asks Buddy for a Diktat of three Lernwörter, Buddy offers it, the generator copies the
// three words out of her list. Everything after that — the recording, the strict check, the
// place a miss is named at — is code and the fake speech gateway (`LB_DEV_SPEECH=fake`), no model.
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptDictation(): void {
  scriptTurns({
    when: /diktat/i,
    answer: says('Gern – ich lese dir deine Lernwörter vor, du schreibst sie.', [
      {
        tool: 'offer_learning',
        args: { kind: 'spelling_dictation', text: 'Schwimmen, Biene, Straße' },
      },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nSchwimmen, Biene, Straße/,
    answer: () => ({
      usable: true,
      title: 'Lernwörter',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [],
      dictation: {
        from: 'list',
        lang: 'de',
        topic: 'Lernwörter',
        entries: ['Schwimmen', 'Biene', 'Straße'],
      },
    }),
  });
}
