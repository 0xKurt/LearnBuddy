// Scripted model answers for the browser walkthrough of ear training (tests/web/ear.spec.ts, issue
// #445). The model chooses only the task and its two notes (`hear_interval`); the question, the
// options, the key and the tones are the server's (`modules/practice/staff.ts`).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptEar(): void {
  scriptGenerations({
    when: /LEARNER'S TEXT:\n[^\n]*Intervalle hören/i,
    answer: () => ({
      usable: true,
      title: 'Intervalle hören',
      subject: { name: 'Musik', kind: 'art_music' },
      items: [],
      staffs: [
        // A minor third, then a perfect fifth from the bass — both inside what the app plays.
        { task: 'hear_interval', lower: { name: 'E', octave: 4 }, upper: { name: 'G', octave: 4 } },
        { task: 'hear_interval', lower: { name: 'C', octave: 3 }, upper: { name: 'G', octave: 3 } },
      ],
    }),
  });
  scriptTurns({
    when: /intervalle hören üben/i,
    answer: says('Gern – ich spiele dir zwei Töne vor, und du sagst, welches Intervall es ist.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Intervalle hören' } },
    ]),
  });
}
