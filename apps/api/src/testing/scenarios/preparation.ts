// Failed preparation through the real offer path (#913), with no live model call.
// requires live verification in Claude Code session (scripted model)
import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptPreparationFailure(): void {
  scriptTurns({
    when: /^Ich will Größen umrechnen üben$/i,
    // Deliberately false model promise: code must correct it when preparation is refused.
    answer: says('Ich habe dir die Übung zu Größen vorbereitet.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Größen umrechnen' } },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nGrößen umrechnen$/i,
    answer: () => ({
      usable: false,
      title: 'Größen umrechnen',
      subject: { name: 'Mathe', kind: 'math' },
      items: [],
    }),
  });
}
