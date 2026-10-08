// Scripted model answers for the flashcard walkthrough (tests/web/cards.spec.ts, issue #384): two
// French words, one that did not sit at once, the run over, its card — and her question about the
// card to the tutor. Keyed by her own words ("Frosch", "Kröte", "grenouille weiblich"), which no
// other spec types, so no rule of another scenario answers them and these answer nothing else
// (issue #350).
// Test tooling only; answers are keyed by the learner's text, never guessed.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { tutorRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

const word = (prompt: string, answer: string) => ({
  kind: 'vocab',
  prompt,
  answer,
  accepted_answers: [],
  unit: null,
  choices: null,
  correct_choice: null,
  difficulty: 1,
  prompt_lang: 'fr',
  lang: 'de',
  topic: 'Tiere und Obst',
  source_excerpt: null,
});

export function scriptCards(): void {
  scriptTurns({
    when: /vokabeln mit frosch/i,
    answer: says('Gern – zwei Wörter aus Unité 3.', [
      { tool: 'offer_learning', args: { kind: 'practice', text: 'Vokabeln Frosch und Zitrone' } },
    ]),
  });
  scriptGenerations({
    when: /Vokabeln Frosch und Zitrone/i,
    answer: () => ({
      usable: true,
      title: 'Unité 3',
      subject: { name: 'Französisch', kind: 'french' },
      items: [word('la grenouille', 'der Frosch'), word('le citron', 'die Zitrone')],
    }),
  });
  tutorRules.add(
    {
      // Her first try at the first word: not it — so the word goes on a card afterwards.
      when: /die Kröte/,
      answer: () => ({
        intent: 'answer',
        verdict: 'incorrect',
        reply: 'Fast – die Kröte ist ein anderes Tier. Versuch es nochmal.',
        gave_hint: false,
        revealed_answer: false,
      }),
    },
    {
      // Her question about the card (#384): never graded, never a rating.
      when: /Ist grenouille weiblich/,
      answer: () => ({
        intent: 'question',
        verdict: 'not_an_attempt',
        reply: 'Ja: la grenouille – das „la“ zeigt es.',
        gave_hint: false,
        revealed_answer: false,
      }),
    },
  );
}
