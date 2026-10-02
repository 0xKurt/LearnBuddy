// Scripted model answers for the browser walkthrough of reading texts and marking
// (tests/web/reading.spec.ts, issues #233 and #234). Keyed by what the learner wrote, never by
// order. The model writes only what it writes in production — the text, its questions, the words
// to mark; the server checks them (Regel 0), counts the lines, gives the ids and keeps the keys.
//
// The marking tasks are the LARGEST the contract allows (contracts/structured.ts, MARK_*): 24
// words with three categories, a long comma sentence, three syllable words of up to twelve
// letters — so the walkthrough measures the worst case on 360×740 (rule 16), not a comfortable
// one. The reading text is long enough that it must scroll in itself.
// Test tooling only.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptGenerations } from './generations.js';
import { says, scriptTurns } from './turns.js';

/** A text of 20 lines, each at most 45 characters — the length Buddy is told to write. */
export const IGEL_LINES = [
  'Im Herbst frisst sich der Igel ein dickes',
  'Fettpolster an. Er sucht Käfer, Würmer und',
  'Schnecken, manchmal auch heruntergefallenes',
  'Obst. Wenn es draußen kälter wird und er',
  'kaum noch Futter findet, baut er sich ein',
  'Nest aus Laub, Moos und trockenem Gras.',
  '',
  'Meist liegt das Nest unter einer Hecke oder',
  'in einem Reisighaufen. Dort rollt sich der',
  'Igel zusammen und beginnt seinen Winter-',
  'schlaf. Sein Herz schlägt dann nur noch',
  'etwa fünfmal in der Minute, und seine',
  'Körpertemperatur sinkt auf wenige Grad.',
  '',
  'Der Winterschlaf dauert ungefähr von',
  'November bis März. In dieser Zeit lebt der',
  'Igel nur von seinem Fett. Wird er gestört,',
  'verbraucht er viel Kraft. Deshalb sollte',
  'man einen Laubhaufen im Garten im Winter',
  'einfach liegen lassen.',
];

export function scriptReadingMarking(): void {
  scriptTurns(
    {
      when: /igel im winter/i,
      answer: says('Gern – hier ist ein Text über den Igel. Lies ihn in Ruhe.', [
        { tool: 'offer_learning', args: { kind: 'read', text: 'Lesetext: Igel im Winter' } },
      ]),
    },
    {
      when: /satzglieder/i,
      answer: says('Gern – markier mal Satzglieder, Kommas und Silben.', [
        { tool: 'offer_learning', args: { kind: 'practice', text: 'Satzglieder markieren' } },
      ]),
    },
  );

  scriptGenerations(
    {
      when: /Igel im Winter/,
      answer: () => ({
        usable: true,
        title: 'Der Igel im Winter',
        subject: { name: 'Deutsch', kind: 'german' },
        reading: {
          title: 'Der Igel im Winter',
          lines: IGEL_LINES,
          lang: 'de',
          topic: 'Igel im Winter',
          questions: [
            {
              kind: 'multiple_choice',
              prompt: 'Woraus baut der Igel sein Nest?',
              choices: ['aus Ästen und Steinen', 'aus Laub, Moos und Gras', 'aus Erde und Sand'],
              correct_choice: 1,
              evidence: 'baut er sich ein Nest aus Laub, Moos und trockenem Gras',
              difficulty: 1,
            },
            {
              kind: 'short',
              prompt: 'Wovon lebt der Igel im Winterschlaf?',
              answer: 'von seinem Fett',
              accepted_answers: ['Fett', 'vom Fettpolster'],
              evidence: 'lebt der Igel nur von seinem Fett',
              difficulty: 2,
            },
            {
              kind: 'true_false',
              statement: 'Im Winterschlaf schlägt das Herz des Igels schneller als sonst.',
              is_true: false,
              evidence: 'Sein Herz schlägt dann nur noch etwa fünfmal in der Minute',
              difficulty: 2,
            },
            {
              kind: 'mark',
              prompt: 'Setze die Kommas in diesem Satz aus dem Text.',
              mode: 'gaps',
              text: 'Wenn es draußen kälter wird und er kaum noch Futter findet, baut er sich ein Nest aus Laub, Moos und trockenem Gras.',
              targets: null,
              categories: null,
              corrected: null,
              difficulty: 3,
            },
            // Line 24 does not exist: this question is never asked (issue #233, Regel 0).
            {
              kind: 'short',
              prompt: 'Was steht in Z. 24?',
              answer: 'nichts',
              accepted_answers: [],
              evidence: 'einfach liegen lassen',
              difficulty: 1,
            },
          ],
        },
      }),
    },
    {
      when: /Satzglieder markieren/,
      answer: () => ({
        usable: true,
        title: 'Markieren',
        subject: { name: 'Deutsch', kind: 'german' },
        items: [],
        structured: [
          // Twelve words, the issue's acceptance case: every one a 44-pt target.
          {
            type: 'mark',
            prompt: 'Tippe alle Nomen an.',
            mode: 'words',
            text: 'am samstag hat meine oma mit uns einen großen kuchen gebacken.',
            targets: [
              { word: 'samstag', occurrence: null, category: null },
              { word: 'oma', occurrence: null, category: null },
              { word: 'kuchen', occurrence: null, category: null },
            ],
            categories: null,
            corrected: null,
            topic: 'Nomen',
            difficulty: 2,
            prompt_lang: 'de',
          },
          // The largest marking: 24 words, three categories.
          {
            type: 'mark',
            prompt: 'Markiere Subjekt, Prädikat und Akkusativobjekt.',
            mode: 'words',
            text: 'Nach der langen Schulstunde heute im Musikraum packt meine beste Freundin Johanna ihre schwere Gitarre ganz vorsichtig in den neuen braunen Koffer aus Leder.',
            targets: [
              { word: 'meine beste Freundin Johanna', occurrence: null, category: 'Subjekt' },
              { word: 'packt', occurrence: null, category: 'Prädikat' },
              { word: 'ihre schwere Gitarre', occurrence: null, category: 'Akkusativobjekt' },
            ],
            categories: ['Subjekt', 'Prädikat', 'Akkusativobjekt'],
            corrected: null,
            topic: 'Satzglieder',
            difficulty: 3,
            prompt_lang: 'de',
          },
          {
            type: 'mark',
            prompt: 'Trenne die Wörter in Silben.',
            mode: 'syllables',
            text: 'Scho-ko-la-de Schmet-ter-ling Ba-na-ne',
            targets: null,
            categories: null,
            corrected: null,
            topic: 'Silben',
            difficulty: 1,
            prompt_lang: 'de',
          },
        ],
      }),
    },
  );
}
