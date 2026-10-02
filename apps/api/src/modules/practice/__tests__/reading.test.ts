// Leseverständnis (issue #233): what code checks before a question about a text exists.

import { describe, expect, it } from 'vitest';

import {
  copiesText,
  keyWordsIn,
  lineRefs,
  linesOf,
  passageFrom,
  passageRefs,
  readingItems,
  refsExist,
  type ReadingDraft,
  type ReadingQuestion,
} from '../reading.js';

export const LINES = [
  'Mia wohnt mit ihrer Familie in einem kleinen Dorf am Rand des Wal-',
  'des. Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei',
  'Kilometer entfernt im Nachbarort liegt.',
  '',
  'An einem Dienstag im November war der Weg vereist. Mia stürzte',
  'an der alten Brücke und verletzte sich am Knie. Ein Bauer, der',
  'gerade mit seinem Traktor vorbeikam, half ihr auf und brachte sie',
  'zur Schule. Seitdem grüßt Mia ihn jeden Morgen.',
];

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
    expect(linesOf(LINES, 'Ein Bauer, der gerade mit seinem Traktor vorbeikam')).toEqual({
      from: 6,
      to: 7,
    });
    expect(linesOf(LINES, 'Mia fährt mit dem Bus')).toBeNull();
  });

  it('reads line references by their format, in the languages a text is taught in', () => {
    expect(lineRefs('Was passiert in Z. 5–6?')).toEqual([5, 6]);
    expect(lineRefs('Lies Zeile 12 noch einmal.')).toEqual([12]);
    expect(lineRefs('What does she say in lines 3-4?')).toEqual([3, 4]);
    expect(lineRefs('Relis la ligne 7.')).toEqual([7]);
    expect(lineRefs('¿Qué pasa en las líneas 2 a 3?')).toEqual([2, 3]);
    expect(lineRefs('Rileggi la riga 9.')).toEqual([9]);
    // Not a line: "Nr. 3", a page, an ordinary number.
    expect(lineRefs('Aufgabe Nr. 3 auf S. 12, 5 Punkte')).toEqual([]);
    expect(refsExist('Was passiert in Z. 12?', LINES.length)).toBe(false);
    expect(refsExist('Was passiert in Z. 5?', LINES.length)).toBe(true);
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

  it('a true/false statement may not copy the text', () => {
    expect(copiesText(LINES, 'Mia stürzte an der alten Brücke')).toBe(true);
    expect(copiesText(LINES, 'Mia hat sich auf dem Schulweg verletzt')).toBe(false);
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
      ]),
      'de',
    );
    expect(items.map((i) => i.kind)).toEqual(['short', 'multiple_choice', 'multiple_choice']);
    expect(items.every((i) => i.read_passage.lines.length === LINES.length)).toBe(true);
    expect(items[0]).toMatchObject({
      spelling: 'gentle',
      prompt_lang: 'de',
      topic: 'Mias Schulweg',
      // "Wal-/des" is one word, on the line it starts on.
      hints: ['Lies nochmal Z. 1.'],
      source_excerpt: 'in einem kleinen Dorf am Rand des Waldes',
    });
    // True/false: two options code wrote, in the text's language.
    expect(items[2]).toMatchObject({ choices: ['Richtig', 'Falsch'], correct_choice: 0 });
  });

  it('drops a question naming a line that does not exist, evidence not in the text, or a copied statement', () => {
    const items = readingItems(
      draft([
        WHERE,
        { ...WHERE, prompt: 'Was passiert in Z. 12?' },
        { ...WHERE, prompt: 'Wohin fährt Mia?', evidence: 'Mia fährt jeden Tag in die Stadt' },
        { ...WHERE, prompt: 'Womit fährt Mia?', answer: 'mit dem Bus' },
        {
          kind: 'true_false',
          statement: 'Mia stürzte an der alten Brücke.',
          is_true: true,
          evidence: 'Mia stürzte an der alten Brücke',
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
      'de',
    );
    expect(items.map((i) => i.prompt)).toEqual(['Wo wohnt Mia?', 'Wer half Mia in Z. 6–7?']);
  });

  it('a group of one question is no group: nothing is stored', () => {
    expect(readingItems(draft([WHERE]), 'de')).toEqual([]);
    expect(readingItems(draft([WHERE, WHERE], ['zu kurz']), 'de')).toEqual([]);
  });

  it('a marking in a reading group marks a sentence OF the text', () => {
    const mark = {
      kind: 'mark',
      prompt: 'Setze die Kommas.',
      mode: 'gaps',
      text: 'Ein Bauer, der gerade mit seinem Traktor vorbeikam, half ihr auf.',
      targets: null,
      categories: null,
      corrected: null,
      difficulty: 2,
    } as const;
    const items = readingItems(
      draft([WHERE, mark, { ...mark, text: 'Ein Bauer, der zufällig vorbeikam, half ihr.' }]),
      'de',
    );
    expect(items.map((i) => i.kind)).toEqual(['short', 'mark']);
    expect(items[1]!.task?.type).toBe('mark');
  });

  it('gives questions about one text one alias in a view', () => {
    const p = { title: 'A', lines: LINES, lang: 'de' };
    const refs = passageRefs([
      { id: 'a', read_passage: p },
      { id: 'b', read_passage: null },
      { id: 'c', read_passage: p },
      { id: 'd', read_passage: { ...p, title: 'B' } },
    ]);
    expect([...refs.entries()]).toEqual([
      ['a', 't1'],
      ['c', 't1'],
      ['d', 't2'],
    ]);
  });
});
