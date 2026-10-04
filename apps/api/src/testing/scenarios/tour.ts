// Scripted model answers for the feature tour (tests/web/tour.spec.ts), after
// the other walkthroughs: something remembered (then undone), a message that
// fails once and is sent again, something to edit in "Was Buddy weiß", and an
// explanation to read again. Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { inTurn, pronounceRules, readingRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

const remember = (statement: string, quote: string) => ({
  tool: 'remember',
  args: { about: 'everyday', kind: 'fact', statement, quote, until: null },
});

// What the tour's sheets read as.
const UNREADABLE = {
  is_learning_material: true,
  readable: false,
  title: null,
  subject: null,
  extracted_text: '',
  items: [],
};

const NOMEN_UND_VERBEN = {
  is_learning_material: true,
  readable: true,
  title: 'Nomen und Verben',
  subject: { name: 'Deutsch', kind: 'german' },
  extracted_text: 'Nomen schreibt man groß. Verben sagen, was jemand tut.',
  items: [
    {
      kind: 'short',
      prompt: 'Wie schreibt man Nomen?',
      answer: 'groß',
      accepted_answers: [],
      unit: null,
      choices: null,
      correct_choice: null,
      topic: 'Nomen',
      difficulty: 1,
      source_excerpt: null,
    },
  ],
};

const HOMEWORK_SQUARE = {
  is_learning_material: true,
  readable: true,
  pages: [
    { page: 1, read: 'all', problem: null },
    { page: 2, read: 'part', problem: 'cut_off' },
  ],
  title: 'Hausaufgabe Quadrat',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text: 'Ein Quadrat hat 4 cm Seitenlänge. Berechne den Umfang.',
  items: [
    {
      kind: 'numeric',
      prompt: 'Ein Quadrat hat 4 cm Seitenlänge. Berechne den Umfang.',
      answer: '16',
      accepted_answers: [],
      unit: 'cm',
      choices: null,
      correct_choice: null,
      topic: 'Umfang',
      difficulty: 1,
      source_excerpt: null,
    },
  ],
};

const HOMEWORK_RECTANGLE = {
  is_learning_material: true,
  readable: true,
  title: 'Hausaufgabe Rechteck',
  subject: { name: 'Mathe', kind: 'math' },
  extracted_text: 'Ein Rechteck ist 6 cm lang und 3 cm breit. Berechne den Flächeninhalt.',
  items: [
    {
      kind: 'numeric',
      prompt: 'Ein Rechteck ist 6 cm lang und 3 cm breit. Berechne den Flächeninhalt.',
      answer: '18',
      accepted_answers: [],
      unit: 'cm²',
      choices: null,
      correct_choice: null,
      topic: 'Flächeninhalt',
      difficulty: 2,
      source_excerpt: null,
    },
  ],
};

export function scriptTour(): void {
  // By what she wrote, not by order (issue #81).
  scriptTurns(
    {
      when: /ich spiele handball/i,
      answer: says('Cool – Handball merke ich mir.', [
        remember('Spielt Handball', 'Ich spiele Handball'),
      ]),
    },
    {
      // Fails once (model down) and works when she sends it again.
      when: /ich mag katzen/i,
      failFirst: true,
      answer: says('Katzen, schön! Das merke ich mir.', [remember('Mag Katzen', 'ich mag Katzen')]),
    },
    { when: /^danke/i, answer: says('Gern!') },
    { when: /^tschüss/i, answer: says('Bis später!') },
    {
      // "erklär mir Nomen": the explanation is the answer, practice on it is offered
      // (owner decision 28.09.).
      when: /erklär mir nomen/i,
      answer: says(
        'Nomen sind Namen für Dinge, Lebewesen und Gefühle. Man schreibt sie groß: der Hund, die Freude. Magst du das gleich üben?',
        [{ tool: 'offer_learning', args: { kind: 'practice', text: 'Nomen', goal: null } }],
      ),
    },
  );
  scriptGenerations({
    when: /Nomen/i,
    answer: () => ({
      usable: true,
      title: 'Nomen',
      subject: { name: 'Deutsch', kind: 'german' },
      items: [
        {
          kind: 'multiple_choice',
          prompt: 'Welches Wort ist ein Nomen?',
          answer: 'Hund',
          accepted_answers: [],
          unit: null,
          choices: ['laufen', 'Hund', 'schnell'],
          correct_choice: 1,
          topic: 'Nomen',
          difficulty: 1,
          prompt_lang: null,
          lang: null,
          figure: null,
          source_excerpt: null,
        },
      ],
    }),
  });
  // Pronunciation: one sentence, judged "almost" with a tip for one word.
  scriptGenerations({
    when: /weather|Englisch/i,
    answer: () => ({
      usable: true,
      title: 'Englisch sprechen',
      subject: { name: 'Englisch', kind: 'english' },
      items: [
        {
          kind: 'speak',
          prompt: 'The weather is nice today.',
          answer: 'The weather is nice today.',
          accepted_answers: [],
          unit: null,
          choices: null,
          correct_choice: null,
          topic: 'Sprechen',
          difficulty: 1,
          prompt_lang: 'en',
          lang: 'en',
          figure: null,
          source_excerpt: null,
        },
      ],
    }),
  });
  // By the sentence she says, not as the next judgement anyone asks for (#350).
  pronounceRules.add({
    when: /The weather is nice today/,
    answer: () => ({
      audible: true,
      expected_ipa: 'ðə ˈwɛðər ɪz naɪs təˈdeɪ',
      heard_ipa: 'de ˈvɛtər ɪs naɪs təˈdeɪ',
      heard: 'the wether is nice today',
      overall: 'almost',
      words: [
        { text: 'The', ok: true, tip: null },
        { text: 'weather', ok: false, tip: '‹th› mit der Zunge zwischen den Zähnen' },
        { text: 'is', ok: true, tip: null },
        { text: 'nice', ok: true, tip: null },
        { text: 'today', ok: true, tip: null },
      ],
      reply: 'Schon gut verständlich! Übe noch das ‹th› in „weather“.',
    }),
  });
  // A sheet that could not be read, read again with success; then homework of two
  // pages whose second is cut off, and that page photographed again.
  // A sheet that could not be read, read again with success; then homework of two pages whose
  // second is cut off, and that page photographed again. By what is read — the sample sheet
  // (800 × 1080) as material or as homework, one page or two — not by queue (#350).
  readingRules.add(
    {
      when: /Photo 1 of 1:\n\[user\] <image 800x1080>/,
      system: /learner's study material/,
      answer: inTurn(UNREADABLE, NOMEN_UND_VERBEN),
    },
    {
      when: /Photo 2 of 2:\n\[user\] <image 800x1080>/,
      system: /learner's homework/,
      answer: () => HOMEWORK_SQUARE,
    },
    {
      when: /Photo 1 of 1:\n\[user\] <image 800x1080>/,
      system: /learner's homework/,
      answer: () => HOMEWORK_RECTANGLE,
    },
  );
  // No check is scripted for the tour: its sheet's practice comes from the check's fixed
  // fallback (checks.ts). The "wait" that stood queued here never reached the tour — the first
  // spec to finish a practice took it.
}
