// Leseverständnis (issue #233): what code checks before a question about a text exists.

import { lineNumbers } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  keyWordsIn,
  lineCount,
  lineRefs,
  linesOf,
  onTheSheet,
  passageFrom,
  passageViews,
  readingItems,
  refsHold,
  standsInText,
  type ReadingDraft,
  type ReadingQuestion,
} from '../reading.js';

const LINES = [
  'Mia wohnt mit ihrer Familie in einem kleinen Dorf am Rand des Wal-',
  'des. Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei',
  'Kilometer entfernt im Nachbarort liegt.',
  '',
  'An einem Dienstag im November war der Weg vereist. Mia stürzte',
  'an der alten Brücke und verletzte sich am Knie. Ein Bauer, der',
  'gerade mit seinem Traktor vorbeikam, half ihr auf und brachte sie',
  'zur Schule. Seitdem grüßt Mia ihn jeden Morgen.',
];

/** The reading's own transcription of the sheet: Markdown, the paragraphs joined. */
const TRANSCRIPT = `# Der Schulweg\n\nMia wohnt mit ihrer Familie in einem kleinen Dorf am Rand des Waldes. Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei Kilometer entfernt im Nachbarort liegt.\n\nAn einem Dienstag im November war der Weg vereist. Mia stürzte an der alten Brücke und verletzte sich am Knie. Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf und brachte sie zur Schule. Seitdem grüßt Mia ihn jeden Morgen.\n\n1. Wo wohnt Mia?`;

const OPTS = { locale: 'de', transcript: TRANSCRIPT };

const draft = (questions: ReadingDraft['questions'], lines = LINES): ReadingDraft => ({
  title: 'Der Schulweg',
  lines,
  lang: 'de',
  topic: 'Mias Schulweg',
  questions,
});

const WHERE: Extract<ReadingQuestion, { kind: 'short' }> = {
  kind: 'short',
  prompt: 'Wo wohnt Mia?',
  answer: 'in einem Dorf am Waldrand',
  accepted_answers: [],
  evidence: 'in einem kleinen Dorf am Rand des Waldes',
  difficulty: 1,
};

describe('the text, by its lines', () => {
  it('finds a quote across a line break and a hyphenated word, and names its lines', () => {
    expect(linesOf(LINES, 'am Rand des Waldes. Jeden Morgen')).toEqual({ from: 1, to: 2 });
    // The empty line between the paragraphs is not counted, as in print.
    expect(linesOf(LINES, 'Ein Bauer, der gerade mit seinem Traktor vorbeikam')).toEqual({
      from: 5,
      to: 6,
    });
    expect(linesOf(LINES, 'Mia fährt mit dem Bus')).toBeNull();
    expect(standsInText(LINES, 'Mia stürzte an der alten Brücke')).toBe(true);
    expect(standsInText(LINES, 'Mia hat sich auf dem Schulweg verletzt')).toBe(false);
  });

  it('reads line references by their format, in the languages a text is taught in', () => {
    expect(lineRefs('Was passiert in Z. 5–6?')).toEqual([{ from: 5, to: 6 }]);
    expect(lineRefs('Lies Zeile 12 noch einmal.')).toEqual([{ from: 12, to: 12 }]);
    expect(lineRefs('What does she say in lines 3-4?')).toEqual([{ from: 3, to: 4 }]);
    expect(lineRefs('Relis la ligne 7.')).toEqual([{ from: 7, to: 7 }]);
    expect(lineRefs('¿Qué pasa en las líneas 2 a 3?')).toEqual([{ from: 2, to: 3 }]);
    expect(lineRefs('Rileggi la riga 9.')).toEqual([{ from: 9, to: 9 }]);
    // Not a line: "Nr. 3", a page, an ordinary number.
    expect(lineRefs('Aufgabe Nr. 3 auf S. 12, 5 Punkte')).toEqual([]);
  });

  it('a named line must exist, and the answer must stand on or next to it', () => {
    expect(refsHold('Was passiert in Z. 12?', LINES.length, null)).toBe(false);
    expect(refsHold('Was passiert in Z. 5?', LINES.length, null)).toBe(true);
    expect(refsHold('Was passiert in Z. 5?', LINES.length, { from: 6, to: 7 })).toBe(true);
    // Sent to line 1 for an answer that stands in lines 6–7: the question counted wrong.
    expect(refsHold('Was steht in Z. 1?', LINES.length, { from: 6, to: 7 })).toBe(false);
    expect(refsHold('Wer half Mia?', LINES.length, { from: 6, to: 7 })).toBe(true);
    // Seven lines of text: the empty one is no line a question can name.
    expect(lineCount(LINES)).toBe(7);
    expect(lineNumbers(['a', '', 'b'])).toEqual([1, null, 2]);
  });

  it('a short answer needs its key words in the evidence; endings may differ', () => {
    expect(keyWordsIn('am Waldrand im Dorf', 'in einem kleinen Dorf am Rand des Waldes')).toBe(
      true,
    );
    expect(keyWordsIn('mit dem Fahrrad', 'fährt sie mit dem Fahrrad zur Schule')).toBe(true);
    expect(keyWordsIn('mit dem Bus', 'fährt sie mit dem Fahrrad zur Schule')).toBe(false);
    expect(keyWordsIn('3 km', 'die drei Kilometer entfernt')).toBe(false);
    // Nothing to look for is not a reading question.
    expect(keyWordsIn('ja', 'Mia wohnt im Dorf')).toBe(false);
  });

  it('the text is the sheet’s: it stands in the transcription, Markdown and line breaks aside', () => {
    expect(onTheSheet(LINES, TRANSCRIPT)).toBe(true);
    expect(onTheSheet([...LINES, 'Am Ende zog Mia in die Stadt.'], TRANSCRIPT)).toBe(false);
    expect(onTheSheet(LINES, '')).toBe(false);
  });

  it('a passage has bounds: lines, length, and no empty ends', () => {
    expect(passageFrom({ title: null, lines: ['', ...LINES, ''], lang: 'de' })?.lines).toEqual(
      LINES,
    );
    expect(passageFrom({ title: null, lines: ['Zu kurz.'], lang: 'de' })).toBeNull();
    expect(passageFrom({ title: null, lines: [...LINES, 'x'.repeat(101)], lang: 'de' })).toBeNull();
    expect(
      passageFrom({
        title: null,
        lines: Array.from({ length: 61 }, () => 'Eine Zeile Text hier.'),
        lang: 'de',
      }),
    ).toBeNull();
  });
});

describe('the questions of a reading text', () => {
  it('keeps the questions that stand in the text, each carrying it and a hint to its lines', () => {
    const items = readingItems(
      draft([
        WHERE,
        {
          kind: 'multiple_choice',
          prompt: 'Wie kommt Mia zur Schule?',
          choices: ['mit dem Bus', 'mit dem Fahrrad', 'zu Fuß'],
          correct_choice: 1,
          evidence: 'fährt sie mit dem Fahrrad zur Schule',
          difficulty: 1,
        },
        {
          kind: 'true_false',
          statement: 'Mia hat sich auf dem Schulweg verletzt.',
          is_true: true,
          evidence: 'Mia stürzte an der alten Brücke und verletzte sich am Knie',
          difficulty: 2,
        },
        {
          kind: 'order',
          prompt: 'Bring die Ereignisse in die richtige Reihenfolge.',
          elements: ['Der Weg ist vereist.', 'Mia stürzt.', 'Ein Bauer hilft ihr.'],
          difficulty: 2,
        },
      ]),
      OPTS,
    );
    expect(items.map((i) => i.kind)).toEqual([
      'short',
      'multiple_choice',
      'multiple_choice',
      'order',
    ]);
    expect(items.every((i) => i.read_passage.lines.length === LINES.length)).toBe(true);
    expect(items[0]).toMatchObject({
      spelling: 'gentle',
      prompt_lang: 'de',
      topic: 'Mias Schulweg',
      // "Wal-/des" is one word, on the line it starts on.
      hints: ['Lies nochmal Zeile 1.'],
      source_excerpt: 'in einem kleinen Dorf am Rand des Waldes',
    });
    // True/false: two options code wrote, in the text's language.
    expect(items[2]).toMatchObject({
      choices: ['Richtig', 'Falsch'],
      correct_choice: 0,
      answer: 'Richtig',
      hints: ['Lies nochmal die Zeilen 4 bis 5.'],
    });
    expect(items[3]!.task?.type).toBe('order');
  });

  it('writes true/false in the text’s language, else in hers', () => {
    const lines = [
      'Tom lives in a small village next to a forest. Every morning he rides',
      'his bike to school, which is three kilometres away in the next town.',
    ];
    const tf = (statement: string) =>
      ({
        kind: 'true_false',
        statement,
        is_true: false,
        evidence: 'he rides his bike to school',
        difficulty: 1,
      }) as const;
    const en = readingItems(
      { ...draft([tf('Tom takes the bus.'), tf('Tom walks to school.')], lines), lang: 'en' },
      { locale: 'de', transcript: lines.join(' ') },
    );
    expect(en[0]).toMatchObject({ choices: ['True', 'False'], correct_choice: 1 });
    const la = readingItems(
      { ...draft([tf('Tom fährt Bus.'), tf('Tom geht zu Fuß.')], lines), lang: 'la' },
      { locale: 'de', transcript: lines.join(' ') },
    );
    expect(la[0]).toMatchObject({ choices: ['Richtig', 'Falsch'] });
  });

  it('drops a question naming a line that does not exist, evidence not in the text, or a copied statement', () => {
    const items = readingItems(
      draft([
        WHERE,
        { ...WHERE, prompt: 'Was passiert in Z. 12?' },
        { ...WHERE, prompt: 'Wohin fährt Mia?', evidence: 'Mia fährt jeden Tag in die Stadt' },
        { ...WHERE, prompt: 'Womit fährt Mia?', answer: 'mit dem Bus' },
        { ...WHERE, prompt: 'Wo wohnt Mia laut Z. 6?' },
        {
          kind: 'true_false',
          statement: 'Mia stürzte an der alten Brücke.',
          is_true: true,
          evidence: 'Mia stürzte an der alten Brücke',
          difficulty: 1,
        },
        {
          kind: 'multiple_choice',
          prompt: 'Wie kommt Mia zur Schule?',
          choices: ['mit dem Fahrrad', 'mit dem Fahrrad'],
          correct_choice: 0,
          evidence: 'fährt sie mit dem Fahrrad zur Schule',
          difficulty: 1,
        },
        {
          kind: 'short',
          prompt: 'Wer half Mia in Z. 6–7?',
          answer: 'ein Bauer mit seinem Traktor',
          accepted_answers: [],
          evidence: 'Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf',
          difficulty: 2,
        },
      ]),
      OPTS,
    );
    // The reference stays together on the screen: a no-break space after "Z.".
    expect(items.map((i) => i.prompt)).toEqual(['Wo wohnt Mia?', 'Wer half Mia in Z.\u00A06–7?']);
  });

  it('a group of one question is no group, and a text not on the sheet is no text: nothing is stored', () => {
    expect(readingItems(draft([WHERE]), OPTS)).toEqual([]);
    expect(readingItems(draft([WHERE, WHERE], ['zu kurz']), OPTS)).toEqual([]);
    expect(readingItems(draft([WHERE, WHERE]), { locale: 'de', transcript: 'Ein Blatt.' })).toEqual(
      [],
    );
  });

  it('gives questions about one text one alias in a view, and their evidence only once shown', () => {
    const p = { title: 'A', lines: LINES, lang: 'de' };
    const ev = 'Ein Bauer, der gerade mit seinem Traktor vorbeikam';
    const row = (id: string, read_passage: unknown, over: Record<string, unknown> = {}) => ({
      id,
      prompt: 'Wer half Mia?',
      read_passage,
      source_excerpt: null as string | null,
      open: false,
      ...over,
    });
    const views = passageViews(
      [
        row('a', p, { source_excerpt: ev, open: true, prompt: 'Wer half Mia in Z.\u00A05–6?' }),
        row('b', null),
        row('c', p, { source_excerpt: ev }),
        row('d', { ...p, title: 'B' }),
        row('e', { lines: 'kaputt' }),
      ],
      (r) => !r.open,
    );
    expect([...views.entries()].map(([id, v]) => [id, v.ref, v.evidence, v.named])).toEqual([
      // Open: where the answer stands is not sent; the lines the question names are.
      ['a', 't1', null, { from: 5, to: 6 }],
      ['c', 't1', { from: 5, to: 6 }, null],
      ['d', 't2', null, null],
    ]);
  });
});
