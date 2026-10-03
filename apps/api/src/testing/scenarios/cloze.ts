// Scripted model answers for the browser walkthrough of the cloze (tests/web/modes.spec.ts,
// issue #232): five typed gaps, three from a word bank, and the longest cloze that may be.
// Its own learner and its own sentences, so no other spec shifts these answers (#313).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptCloze(): void {
  scriptTurns({
    when: /lückentext/i,
    answer: says('Gern – ich hab dir drei Lückentexte vorbereitet.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Lückentext Verben' } },
    ]),
  });
  // Cloze items (issue #232): the model writes the text with "___" for each gap and the keys
  // in reading order — code checks them (Regel 0), cuts the text, names the gaps and keeps
  // the keys. Five typed gaps first (the issue’s walkthrough: 360×740 with the keyboard
  // open), then three from a word bank with one distractor. No tutor is scripted: every
  // answer the walkthrough gives is decided by the rules.
  scriptGenerations({
    when: /Lückentext/i,
    answer: () => ({
      usable: true,
      title: 'Lückentext',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [],
      structured: [
        {
          type: 'cloze',
          prompt: 'Setze die Verben im Perfekt ein.',
          text: 'Gestern ___ wir in den Zoo gegangen. Zuerst ___ wir die Affen angeschaut. Dann hat mein Bruder ein Eis ___. Am Abend ___ wir müde nach Hause gefahren. Es war ein ___ Tag.',
          gaps: [
            { answer: 'sind', accepted_answers: [] },
            { answer: 'haben', accepted_answers: [] },
            { answer: 'gegessen', accepted_answers: [] },
            { answer: 'sind', accepted_answers: [] },
            { answer: 'schöner', accepted_answers: [] },
          ],
          word_bank: null,
          spelling: null,
          topic: 'Perfekt',
          difficulty: 2,
          prompt_lang: 'de',
        },
        {
          type: 'cloze',
          prompt: 'Setze die passenden Verben ein.',
          text: 'Lena ___ jeden Morgen um sieben auf. Sie ___ schnell ihr Müsli und ___ dann mit dem Bus zur Schule.',
          gaps: [
            { answer: 'steht', accepted_answers: [] },
            { answer: 'isst', accepted_answers: [] },
            { answer: 'fährt', accepted_answers: [] },
          ],
          word_bank: ['steht', 'isst', 'fährt', 'schläft'],
          spelling: null,
          topic: 'Präsens',
          difficulty: 1,
          prompt_lang: 'de',
        },
        // The longest a cloze may be (issue #232): 8 gaps, 256 of the 260 characters and an
        // instruction of 78 of 80 — it must still fit 360×740 without scrolling (rule 16).
        {
          type: 'cloze',
          prompt: 'Setze die Verben im Präteritum ein. Achte dabei auf die Person und die Endung.',
          text: 'Am Morgen ___ Tim mit seinem Hund in den Park. Dort ___ er einen alten Freund. Die beiden ___ auf einer Bank. Dann ___ der Hund einem Ball hinterher. Tim ___ laut nach ihm. Erst nach einer Weile ___ er zurück. Zu Hause ___ Tim seiner Mutter alles. Am Abend ___ alle zufrieden ein.',
          gaps: ['ging', 'traf', 'saßen', 'rannte', 'rief', 'kam', 'erzählte', 'schliefen'].map(
            (answer) => ({ answer, accepted_answers: [] }),
          ),
          word_bank: null,
          spelling: null,
          topic: 'Präteritum',
          difficulty: 2,
          prompt_lang: 'de',
        },
      ],
    }),
  });
}
