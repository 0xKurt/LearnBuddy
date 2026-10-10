// „Anders erklären" with a picture (issue #298): the explanation of a closed question shows ONE
// figure of the library — here three parabolas that differ only in a. Shared by the integration
// test (`__tests__/reexplain.int.test.ts`) and the browser walkthrough of the gallery
// (tests/web/gallery.spec.ts, issue #387). Her own sentence („Streckfaktor"), which no other spec
// types (#350); the question avoids the word "Parabel" an older rule knows.
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { base } from './learning-modes.js';
import { reexplainRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

/** Three graphs of a·x² in one plot: the picture of what a does. */
export const PARABOLAS = {
  type: 'function_plot',
  functions: [
    { expr: 'x^2', label: 'a = 1' },
    { expr: '2*x^2', label: 'a = 2' },
    { expr: '0.5*x^2', label: 'a = 0,5' },
  ],
  x_min: -3,
  x_max: 3,
  y_min: -1,
  y_max: 9,
  points: [],
};

/** The words that go with the picture. */
export const PARABOLA_WORDS = 'Je größer a, desto schmaler wird die Parabel.';

const QUESTION = 'Was passiert mit dem Graphen von f(x) = a·x², wenn a größer wird?';

export function scriptExplainFigure(): void {
  scriptTurns({
    when: /streckfaktor/i,
    answer: says('Gern – eine Frage zum Streckfaktor, danach erkläre ich es dir mit Bild.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Streckfaktor' } },
    ]),
  });
  scriptGenerations({
    when: /Streckfaktor/i,
    answer: () => ({
      usable: true,
      title: 'Streckfaktor',
      subject: { name: 'Mathe', kind: 'math' },
      items: [
        {
          ...base,
          kind: 'multiple_choice',
          prompt: QUESTION,
          answer: 'Er wird schmaler.',
          choices: ['Er wird schmaler.', 'Er wird breiter.', 'Er rückt nach oben.'],
          correct_choice: 0,
          topic: 'Quadratische Funktionen',
          prompt_lang: 'de',
        },
      ],
    }),
  });
  reexplainRules.add({
    when: /f\(x\) = a·x², wenn a größer wird/,
    answer: () => ({
      explanation: `${PARABOLA_WORDS} Bei a = 2 ist jeder Wert doppelt so hoch wie bei a = 1 – der Graph steigt schneller an.`,
      figure: PARABOLAS,
    }),
  });
}
