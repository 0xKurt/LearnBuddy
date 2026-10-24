// Topic vocabulary via Buddy and the real preparation path (#940).
// requires live verification in Claude Code session
import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

export function scriptTopicVocabulary(): void {
  const text = 'Basisvokabeln zur Wohnung';
  scriptTurns({
    when: /^Schick mir 2 englische Vokabeln zur Wohnung im Chat$/i,
    answer: says('Ich bereite die Wörter vor.', [
      {
        tool: 'offer_learning',
        args: {
          kind: 'vocab',
          text,
          vocabulary: {
            source: 'topic',
            output: 'chat',
            count: 2,
            prompt_lang: 'en',
            lang: 'de',
            direction: 'both',
          },
        },
      },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nBasisvokabeln zur Wohnung$/,
    answer: () => ({
      usable: true,
      title: 'Wohnung',
      subject: { name: 'Englisch', kind: 'english' },
      items: [
        ['the kitchen', 'die Küche'],
        ['the room', 'das Zimmer'],
      ].map(([prompt, answer]) => ({
        kind: 'vocab',
        prompt,
        answer,
        accepted_answers: [],
        reverse_answers: [],
        prompt_lang: 'en',
        lang: 'de',
        unit: null,
        choices: null,
        correct_choice: null,
        topic: 'Wohnung',
        difficulty: 2,
        figure: null,
        source_excerpt: null,
      })),
    }),
  });
}
