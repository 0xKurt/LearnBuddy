// Scripted model answers for the feature tour (tests/web/tour.spec.ts), after
// the other walkthroughs: something remembered (then undone), a message that
// fails once and is sent again, something to edit in "Was Buddy weiß", and an
// explanation to read again. Test tooling only.

import { LlmError } from '../../llm/gateway.js';
import type { ScriptedGateway } from '../fakes.js';

const turn = (reply: string, actions: unknown[] = []) => ({
  json: { lookups: [], actions, reply, options: null, asks_permission: false },
});
const remember = (statement: string, quote: string) => ({
  tool: 'remember',
  args: { kind: 'fact', statement, quote, until: null },
});

export function scriptTour(llm: ScriptedGateway): void {
  llm.script(
    'buddy_turn',
    turn('Cool – Handball merke ich mir.', [remember('Spielt Handball', 'Ich spiele Handball')]),
    // The next message fails once (model down) and is sent again.
    { error: new LlmError('unavailable', 'provider down') },
    turn('Katzen, schön! Das merke ich mir.', [remember('Mag Katzen', 'ich mag Katzen')]),
    turn('Gern!'),
    turn('Bis später!'),
  );
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Nomen',
      subject: { name: 'Deutsch', kind: 'german' },
      intro:
        'Nomen sind Namen für Dinge, Lebewesen und Gefühle. Man schreibt sie groß: der Hund, die Freude.',
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
    },
  });
  // Pronunciation: one sentence, judged "almost" with a tip for one word.
  llm.script('explain', {
    json: {
      usable: true,
      title: 'Englisch sprechen',
      subject: { name: 'Englisch', kind: 'english' },
      intro: null,
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
    },
  });
  llm.script('pronounce', {
    json: {
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
    },
  });
  // A sheet that could not be read, read again with success; then homework of two
  // pages whose second is cut off, and that page photographed again.
  llm.script(
    'extraction',
    {
      json: {
        is_learning_material: true,
        readable: false,
        title: null,
        subject: null,
        extracted_text: '',
        items: [],
      },
    },
    {
      json: {
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
      },
    },
    {
      json: {
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
      },
    },
    {
      json: {
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
      },
    },
  );
  llm.script('buddy_check', {
    json: { disposition: 'wait', reason: 'Nothing to add now.', actions: [], outreach: null },
  });
}
