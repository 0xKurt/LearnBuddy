// Scripted model answers for the Hörverstehen walkthrough (tests/web/listening.spec.ts, issues
// #210 and #311 step 2): she asks Buddy to practise listening, Buddy offers it, the generator
// writes a short text and two questions about it. Everything after that — the recording, the
// check of her answer against the text, the transcript once a question is closed — is code and
// the fake speech gateway (`LB_DEV_SPEECH=fake`), no model.
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

const TEXT =
  'Am Samstag fuhr Tom mit dem Bus in die Stadt. Er wollte ein Geschenk für seine Schwester kaufen, denn sie hat am Sonntag Geburtstag. Am Ende kaufte er ein Buch über Pferde und eine kleine blaue Kerze.';

export function scriptListening(): void {
  scriptTurns({
    when: /hörverstehen üben/i,
    answer: says('Gern – ich lese dir einen kurzen Text vor, und du beantwortest Fragen dazu.', [
      { tool: 'offer_learning', args: { kind: 'listen', text: 'Toms Samstag' } },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nToms Samstag/,
    answer: () => ({
      usable: true,
      title: 'Toms Samstag',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [],
      listen: {
        text: TEXT,
        lang: 'de',
        questions: [
          {
            kind: 'short',
            prompt: 'Was kaufte Tom für seine Schwester?',
            answer: 'ein Buch über Pferde',
            choices: null,
            correct_choice: null,
            accepted_answers: [],
            topic: 'Toms Samstag',
            difficulty: 1,
          },
          {
            kind: 'multiple_choice',
            prompt: 'Womit fuhr Tom in die Stadt?',
            answer: 'mit dem Bus',
            choices: ['mit dem Bus', 'mit dem Fahrrad', 'mit dem Zug'],
            correct_choice: 0,
            accepted_answers: [],
            topic: 'Toms Samstag',
            difficulty: 1,
          },
        ],
      },
    }),
  });
}
