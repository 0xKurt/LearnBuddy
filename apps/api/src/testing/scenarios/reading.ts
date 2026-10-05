// Scripted model answers for the browser walkthrough of a reading text (tests/web/reading.spec.ts,
// issue #233): a photographed page with a story of 20 lines and seven questions about it — short,
// multiple choice, true/false, an order and a Belegstelle (#368: she taps the lines that back a
// statement) — of which code keeps six (one names a line the text does not have). Its own learner: the reading is keyed by her age (11, nobody else's in the
// walkthrough), so no other spec's sheet can be read as hers, nor hers as theirs (#313, #350).
// Test tooling only; every answer the walkthrough gives is decided by the rules.
// requires live verification in Claude Code session (stand-ins for the outside world; scripted model)

import { scriptChecks } from './checks.js';
import { scriptGenerations } from './generations.js';
import { readingRules } from './rules.js';
import { says, scriptTurns } from './turns.js';

/** The story as printed: 20 lines of text in five paragraphs, so it scrolls in its box on every phone. */
const READING_LINES = [
  'Mia wohnt mit ihrer Familie in einem kleinen Dorf am Rand',
  'des Waldes. Jeden Morgen fährt sie mit dem Fahrrad zur',
  'Schule, die drei Kilometer entfernt im Nachbarort liegt.',
  'Meistens fährt ihr Freund Jonas ein Stück mit ihr.',
  '',
  'An einem Dienstag im November war der Weg vereist. Jonas',
  'war krank, und Mia fuhr allein. An der alten Brücke rutsch-',
  'te ihr Hinterrad weg, und sie stürzte auf das harte Pflaster.',
  'Ihr Knie blutete, und das Fahrrad lag verbogen im Graben.',
  '',
  'Ein Bauer, der gerade mit seinem Traktor vorbeikam, hielt',
  'sofort an. Er half ihr auf, legte das Fahrrad auf den An-',
  'hänger und brachte Mia zur Schule. Dort verband die Sekre-',
  'tärin ihr Knie, und Mia kam nur zehn Minuten zu spät.',
  '',
  'Am Nachmittag holte ihr Vater das Fahrrad beim Bauern ab.',
  'Der Bauer hatte das verbogene Vorderrad schon gerichtet.',
  'Mia malte ihm zum Dank ein Bild von seinem roten Traktor.',
  '',
  'Seitdem winkt Mia dem Bauern jeden Morgen zu, wenn sie an',
  'seinem Hof vorbeifährt. Und wenn der Weg vereist ist,',
  'schiebt sie ihr Fahrrad über die alte Brücke, statt zu',
  'fahren. Jonas lacht darüber, aber Mia ist es egal: Sie',
  'weiß, wie hart das Pflaster dort ist.',
];

const TRANSCRIPT = `# Der Schulweg\n\n${READING_LINES.join('\n')}`;

/**
 * A text Buddy writes himself (#368): she asks for reading practice in the chat, Buddy offers a
 * reading run, the generator writes a text of about 1000 characters (it fits grade 5 up to an adult)
 * and five questions, of which code keeps four (one names a line — the lines are code's).
 */
const IGEL = [
  'Im Herbst frisst sich der Igel ein dickes Fettpolster an. Er sucht Käfer, Würmer und Schnecken unter dem Laub. Je schwerer er wird, desto besser übersteht er die kalte Zeit.',
  'Wenn die Tage kürzer werden, baut er sich ein Nest aus Blättern und Moos. Oft liegt es unter einer Hecke oder in einem Reisighaufen. Dort rollt er sich zu einer Kugel zusammen.',
  'Im Winterschlaf schlägt sein Herz nur noch wenige Male in der Minute. Seine Körpertemperatur sinkt auf etwa fünf Grad. So verbraucht er kaum Energie und lebt von seinem Fett.',
  'Im Frühling wacht der Igel wieder auf. Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren. Gärten mit wilden Ecken helfen ihm, schnell wieder Futter zu finden.',
  'Igel sind vor allem in der Nacht unterwegs. Am Tag schlafen sie gut versteckt unter Büschen. Ihre Stacheln schützen sie vor Füchsen und anderen Feinden.',
  'Wer Igeln helfen will, lässt im Herbst einen Laubhaufen liegen. Ein flaches Schälchen mit Wasser hilft ihnen an heißen Tagen.',
];

function scriptBuddyReading(): void {
  scriptTurns({
    when: /lesetext über igel/i,
    answer: says('Gern – ich schreibe dir einen Text über den Igel im Winter.', [
      { tool: 'offer_learning', args: { kind: 'read', text: 'Igel im Winter' } },
    ]),
  });
  scriptGenerations({
    when: /LEARNER'S TEXT:\nIgel im Winter/,
    answer: () => ({
      usable: true,
      title: 'Der Igel im Winter',
      subject: { name: 'Biologie', kind: 'biology' },
      items: [],
      reading: {
        title: 'Der Igel im Winter',
        paragraphs: IGEL,
        lang: 'de',
        topic: 'Igel im Winter',
        questions: [
          {
            kind: 'multiple_choice',
            prompt: 'Wo liegt das Nest des Igels oft?',
            choices: ['unter einer Hecke', 'auf einem Baum', 'in einem Teich'],
            correct_choice: 0,
            evidence: 'Oft liegt es unter einer Hecke oder in einem Reisighaufen',
            difficulty: 1,
          },
          {
            kind: 'short',
            prompt: 'Wovon lebt der Igel im Winterschlaf?',
            answer: 'von seinem Fett',
            accepted_answers: [],
            evidence: 'So verbraucht er kaum Energie und lebt von seinem Fett',
            difficulty: 1,
          },
          // Dropped by code: the lines are code's, the model cannot know line 3.
          {
            kind: 'short',
            prompt: 'Was frisst der Igel laut Z. 3?',
            answer: 'Käfer',
            accepted_answers: [],
            evidence: 'Er sucht Käfer, Würmer und Schnecken unter dem Laub',
            difficulty: 1,
          },
          {
            kind: 'true_false',
            statement: 'Im Winterschlaf bleibt der Igel so warm wie im Sommer.',
            is_true: false,
            evidence: 'Seine Körpertemperatur sinkt auf etwa fünf Grad',
            difficulty: 2,
          },
          {
            kind: 'evidence',
            statement: 'Nach dem Winter braucht der Igel schnell Nahrung.',
            evidence: 'Dann ist er sehr hungrig und hat fast ein Drittel seines Gewichts verloren',
            difficulty: 2,
          },
        ],
      },
    }),
  });
}

export function scriptReading(): void {
  scriptBuddyReading();
  // Before the tour's rules: its photo is the same fixture, and the first matching rule wins.
  readingRules.add({
    when: /LEARNER: 11 years/,
    system: /learner's study material/,
    answer: () => ({
      is_learning_material: true,
      readable: true,
      title: 'Der Schulweg',
      subject: { name: 'Deutsch', kind: 'german' },
      extracted_text: TRANSCRIPT,
      items: [],
      structured: [],
      reading: [
        {
          title: 'Der Schulweg',
          lines: READING_LINES,
          lang: 'de',
          topic: 'Mias Schulweg',
          questions: [
            {
              kind: 'short',
              prompt: 'Womit fährt Mia jeden Morgen zur Schule?',
              answer: 'mit dem Fahrrad',
              accepted_answers: ['Fahrrad'],
              evidence: 'fährt sie mit dem Fahrrad zur Schule',
              difficulty: 1,
            },
            {
              kind: 'multiple_choice',
              prompt: 'Wer hilft Mia nach dem Sturz an der Brücke?',
              choices: ['ihr Freund Jonas', 'ein Bauer mit seinem Traktor', 'ihr Vater'],
              correct_choice: 1,
              evidence: 'Ein Bauer, der gerade mit seinem Traktor vorbeikam, hielt sofort an',
              difficulty: 1,
            },
            {
              kind: 'true_false',
              statement: 'Mia kam an diesem Tag eine Stunde zu spät in die Schule.',
              is_true: false,
              evidence: 'Mia kam nur zehn Minuten zu spät',
              difficulty: 2,
            },
            // Dropped by code: the text has 20 lines (the empty ones are not counted).
            {
              kind: 'short',
              prompt: 'Was steht in Z. 31 über den Traktor?',
              answer: 'er ist rot',
              accepted_answers: [],
              evidence: 'ein Bild von seinem roten Traktor',
              difficulty: 2,
            },
            {
              kind: 'short',
              prompt: 'Was macht Mia seit dem Unfall, wenn der Weg vereist ist (Z. 17–19)?',
              answer: 'sie schiebt ihr Fahrrad über die Brücke',
              accepted_answers: ['schieben'],
              evidence: 'schiebt sie ihr Fahrrad über die alte Brücke, statt zu fahren',
              difficulty: 2,
            },
            {
              kind: 'order',
              prompt: 'Bring die Ereignisse in die Reihenfolge der Geschichte.',
              elements: [
                'Mia stürzt an der Brücke.',
                'Der Bauer bringt sie zur Schule.',
                'Der Vater holt das Fahrrad ab.',
                'Mia malt ein Bild für den Bauern.',
              ],
              difficulty: 2,
            },
            // A Belegstelle late in the text, over a paragraph break: lines 15–16 (#368).
            {
              kind: 'evidence',
              statement: 'Mia ist dem Bauern dankbar.',
              evidence:
                'Mia malte ihm zum Dank ein Bild von seinem roten Traktor. Seitdem winkt Mia dem Bauern jeden Morgen zu',
              difficulty: 2,
            },
          ],
        },
      ],
    }),
  });
  // Buddy acts on the read page: a practice from it, ready on the home (`practice_ready`).
  scriptChecks({
    when: /new material is ready: "Der Schulweg"/,
    answer: () => ({
      disposition: 'act',
      reason: 'A reading text with questions is ready: prepare it.',
      actions: [
        {
          tool: 'prepare_practice',
          args: { goal: null, subject: null, minutes: 10, focus_topics: [] },
        },
      ],
      outreach: null,
    }),
  });
}
