// Scripted model answers for the browser walkthrough of ear training (tests/web/ear.spec.ts, issue
// #445). The model chooses only the task and its parameters — two notes (`hear_interval`) or a
// rhythm (`tap_rhythm`); the question, the options, the key and the tones are the server's
// (`modules/practice/staff.ts`), and so is the measure of her taps (`modules/practice/rhythm.ts`).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const quarter = { el: 'note', value: 'quarter', dotted: false } as const;
const eighth = { el: 'note', value: 'eighth', dotted: false } as const;

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
  scriptGenerations({
    when: /LEARNER'S TEXT:\n[^\n]*Rhythmus nachklopfen/i,
    answer: () => ({
      usable: true,
      title: 'Rhythmus nachklopfen',
      subject: { name: 'Musik', kind: 'art_music' },
      items: [],
      // Viertel, Viertel, zwei Achtel, Viertel: at 80 the beats fall at 0, 750, 1500, 1875, 2250 ms.
      staffs: [
        { task: 'tap_rhythm', time: '4/4', bars: [[quarter, quarter, eighth, eighth, quarter]] },
      ],
    }),
  });
  scriptTurns({
    when: /rhythmus nachklopfen üben/i,
    answer: says('Gern – ich spiele dir einen Rhythmus vor, und du klopfst ihn nach.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Rhythmus nachklopfen' } },
    ]),
  });
}
