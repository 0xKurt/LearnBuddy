// Markieren (issue #234): Regel 0 in both directions — what the model wrote, and what she marked.
// The acceptance list of the issue: tokenisation, a word that stands twice, comma gaps,
// syllables, the error text's correction — each rejection by its name.

import { MARK_SORTED_WORDS_MAX, markTargets } from '@learnbuddy/shared-types/contracts';
import { describe, expect, it } from 'vitest';

import {
  checkMark,
  markAnswerText,
  markDraftProblem,
  markProblem,
  markReply,
  markSolution,
  markTaskFrom,
  markView,
  namesAMark,
  splitWords,
  type MarkDraft,
} from '../mark.js';
import { readingItems, type ReadingQuestion } from '../reading.js';
import { structuredItem, viewOf } from '../structured.js';

const words = (text: string, targets: MarkDraft['targets'], more: Partial<MarkDraft> = {}) =>
  ({ mode: 'words', text, targets, categories: null, corrected: null, ...more }) as MarkDraft;

const gaps: MarkDraft = {
  mode: 'gaps',
  text: '',
  targets: null,
  categories: null,
  corrected: null,
};
const syl: MarkDraft = { ...gaps, mode: 'syllables' };

describe('splitting a text into words (code, never the model)', () => {
  it('keeps punctuation with its word and never as a target', () => {
    expect(splitWords('„Komm her“, rief der Hund.')).toEqual([
      { lead: '„', text: 'Komm', tail: '' },
      { lead: '', text: 'her', tail: '“,' },
      { lead: '', text: 'rief', tail: '' },
      { lead: '', text: 'der', tail: '' },
      { lead: '', text: 'Hund', tail: '.' },
    ]);
  });

  it('joins a dash standing alone to the word before it, and keeps inner hyphens', () => {
    expect(splitWords('Die E-Mail – endlich da')).toEqual([
      { lead: '', text: 'Die', tail: '' },
      { lead: '', text: 'E-Mail', tail: ' –' },
      { lead: '', text: 'endlich', tail: '' },
      { lead: '', text: 'da', tail: '' },
    ]);
  });

  it('refuses a word longer than one target can hold', () => {
    expect(splitWords('Ein Donaudampfschifffahrtsgesellschaftskapitän kommt')).toBeNull();
  });
});

describe('marking words: the model names them, code finds them', () => {
  it('builds a task whose key are positions, and a view without the key', () => {
    const task = markTaskFrom(
      words('Der Hund bellt laut im Garten.', [
        { word: 'Hund', occurrence: null, category: null },
        { word: 'Garten', occurrence: null, category: null },
      ]),
    );
    expect(task).not.toBeNull();
    expect(task!.key).toEqual([
      { at: 'w2', category: null },
      { at: 'w6', category: null },
    ]);
    const view = markView(task!);
    expect(view).not.toHaveProperty('key');
    expect(JSON.stringify(view)).not.toContain('"key"');
    expect(markSolution(task!)).toBe('Hund, Garten');
  });

  it('a word that stands twice needs its occurrence — without it the task is ambiguous', () => {
    const text = 'Der Hund sieht den Hund im Spiegel.';
    expect(
      markDraftProblem(words(text, [{ word: 'Hund', occurrence: null, category: null }])),
    ).toBe('ambiguous');
    const second = markTaskFrom(words(text, [{ word: 'Hund', occurrence: 2, category: null }]));
    expect(second?.key).toEqual([{ at: 'w5', category: null }]);
    // Case does not make two words different to find: "Der" and "der" are both "der".
    expect(
      markDraftProblem(
        words('Der Ball und der Hund', [{ word: 'der', occurrence: null, category: null }]),
      ),
    ).toBe('ambiguous');
  });

  it('a word that is not in the text, or not that often, drops the task', () => {
    const text = 'Die Katze schläft auf dem Sofa.';
    expect(
      markDraftProblem(words(text, [{ word: 'Hund', occurrence: null, category: null }])),
    ).toBe('not_in_text');
    expect(markDraftProblem(words(text, [{ word: 'Katze', occurrence: 2, category: null }]))).toBe(
      'not_in_text',
    );
  });

  it('a phrase marks its words; the same word twice is no single right answer', () => {
    const task = markTaskFrom(
      words(
        'Der kleine Hund bellt den Postboten an.',
        [
          { word: 'Der kleine Hund', occurrence: null, category: 'Subjekt' },
          { word: 'bellt', occurrence: null, category: 'Prädikat' },
        ],
        { categories: ['Subjekt', 'Prädikat'] },
      ),
    );
    expect(task?.key).toEqual([
      { at: 'w1', category: 'k1' },
      { at: 'w2', category: 'k1' },
      { at: 'w3', category: 'k1' },
      { at: 'w4', category: 'k2' },
    ]);
    expect(markSolution(task!)).toBe('Subjekt: Der kleine Hund; Prädikat: bellt');
    expect(
      markDraftProblem(
        words('Der Hund bellt laut.', [
          { word: 'Hund', occurrence: null, category: null },
          { word: 'Hund', occurrence: 1, category: null },
        ]),
      ),
    ).toBe('ambiguous');
  });

  it('categories: every target names one, every one is used, none outside them', () => {
    const text = 'Der Hund bellt den Postboten an.';
    const both = ['Subjekt', 'Prädikat'];
    expect(
      markDraftProblem(
        words(text, [{ word: 'Hund', occurrence: null, category: 'Subjekt' }], {
          categories: both,
        }),
      ),
    ).toBe('empty_group');
    expect(
      markDraftProblem(
        words(text, [{ word: 'Hund', occurrence: null, category: 'Objekt' }], {
          categories: both,
        }),
      ),
    ).toBe('empty_group');
    expect(
      markDraftProblem(
        words(text, [{ word: 'Hund', occurrence: null, category: 'Subjekt' }], {
          categories: ['Subjekt'],
        }),
      ),
    ).toBe('count');
    expect(markDraftProblem(words(text, [{ word: 'Hund', occurrence: null, category: 'X' }]))).toBe(
      'form',
    );
  });

  it('a text sorted into categories has a measured maximum of words and rows — the buttons take rows of their own', () => {
    const many = (n: number) =>
      ['Der', 'Hund', 'bellt', ...Array.from({ length: n - 3 }, (_, i) => `laut${i}`)].join(' ');
    const sorted = (text: string) =>
      words(
        text,
        [
          { word: 'Hund', occurrence: null, category: 'Subjekt' },
          { word: 'bellt', occurrence: null, category: 'Prädikat' },
        ],
        { categories: ['Subjekt', 'Prädikat'] },
      );
    expect(markDraftProblem(sorted(many(MARK_SORTED_WORDS_MAX)))).toBeNull();
    expect(markDraftProblem(sorted(many(MARK_SORTED_WORDS_MAX + 1)))).toBe('count');
    // Long words fill a row sooner: the rows are counted with each tile's width (`markRows`) —
    // 11 words and 66 characters, but the long ones wrap to a third row.
    expect(
      markDraftProblem(sorted('Der Hund bellt ausgesprochen ausdauernd ununterbrochen hinterher.')),
    ).toBe('count');
    // A real Satzglieder sentence of grades 5–7 (#368): ten words, 65 characters, two rows of
    // touching tiles. Refused before #368 (at most 7 words and 45 characters).
    expect(
      markDraftProblem(
        words(
          'Am Wochenende schenkt der Vater seiner Tochter ein neues Fahrrad.',
          [
            { word: 'der Vater', occurrence: null, category: 'Subjekt' },
            { word: 'seiner Tochter', occurrence: null, category: 'Dativobjekt' },
            { word: 'ein neues Fahrrad', occurrence: null, category: 'Akkusativobjekt' },
          ],
          { categories: ['Dativobjekt', 'Akkusativobjekt', 'Subjekt'] },
        ),
      ),
    ).toBeNull();
    // Without categories the same 13 words are a task.
    expect(
      markDraftProblem(words(many(13), [{ word: 'Hund', occurrence: null, category: null }])),
    ).toBeNull();
  });

  it('category names are the school terms; their buttons wrap to two rows at most', () => {
    const three = (names: string[]) =>
      words(
        'Die Oma liest den Kindern vor.',
        [
          { word: 'Die Oma', occurrence: null, category: names[0]! },
          { word: 'liest', occurrence: null, category: names[1]! },
          { word: 'den Kindern', occurrence: null, category: names[2]! },
        ],
        { categories: names },
      );
    expect(markDraftProblem(three(['Subjekt', 'Prädikat', 'Akkusativobjekt']))).toBeNull();
    expect(
      markDraftProblem(three(['Akkusativobjekt', 'Dativobjekt', 'Präpositionalobjekt'])),
    ).toBeNull();
    // Over 20 characters is no school term; three long ones would take three rows.
    expect(markDraftProblem(three(['Subjekt', 'Prädikat', 'Präpositionalobjektiv']))).toBe(
      'too_long',
    );
    expect(
      markDraftProblem(three(['Präpositionalobjekt', 'Adverbialbestimmung', 'Akkusativobjekt'])),
    ).toBe('too_long');
  });

  it('too few or too many words, no target, or a long prompt is no task', () => {
    expect(
      markDraftProblem(words('Hund bellt', [{ word: 'Hund', occurrence: null, category: null }])),
    ).toBe('count');
    expect(markDraftProblem(words('Der Hund bellt laut.', []))).toBe('count');
    const long = Array.from(
      { length: 25 },
      (_, i) => `Wort${String.fromCharCode(97 + (i % 26))}`,
    ).join(' ');
    expect(
      markDraftProblem(words(long, [{ word: 'Worta', occurrence: null, category: null }])),
    ).toBe('count');
    expect(
      markDraftProblem({
        ...words('Der Hund bellt laut.', [{ word: 'Hund', occurrence: null, category: null }]),
        prompt: 'x'.repeat(91),
      }),
    ).toBe('too_long');
  });
});

describe('an error text: the correction differs exactly at the marked words', () => {
  const text = 'Gestern bin ich mit meinem hund in den Park gelaufen und habe gespilt.';
  const corrected = 'Gestern bin ich mit meinem Hund in den Park gelaufen und habe gespielt.';

  it('is stored when the marked words are exactly the corrected ones', () => {
    const task = markTaskFrom(
      words(
        text,
        [
          { word: 'hund', occurrence: null, category: null },
          { word: 'gespilt', occurrence: null, category: null },
        ],
        { corrected },
      ),
    );
    expect(task?.corrections).toEqual([
      { at: 'w6', text: 'Hund' },
      { at: 'w13', text: 'gespielt' },
    ]);
    expect(markSolution(task!)).toBe('hund → Hund, gespilt → gespielt');
    // The corrections never reach the app.
    expect(JSON.stringify(markView(task!))).not.toContain('gespielt');
  });

  it('is rejected when an error is not marked, a marked word is not corrected, or words differ in number', () => {
    expect(
      markDraftProblem(
        words(text, [{ word: 'hund', occurrence: null, category: null }], { corrected }),
      ),
    ).toBe('correction');
    expect(
      markDraftProblem(
        words(
          text,
          [
            { word: 'hund', occurrence: null, category: null },
            { word: 'gespilt', occurrence: null, category: null },
            { word: 'Park', occurrence: null, category: null },
          ],
          { corrected },
        ),
      ),
    ).toBe('correction');
    expect(
      markDraftProblem(
        words(text, [{ word: 'hund', occurrence: null, category: null }], {
          corrected: 'Gestern bin ich mit meinem Hund gelaufen.',
        }),
      ),
    ).toBe('correction');
  });
});

describe('commas: the gaps between words', () => {
  const draft: MarkDraft = {
    mode: 'gaps',
    text: 'Als es dunkel wurde, gingen wir nach Hause, weil wir müde waren.',
    targets: null,
    categories: null,
    corrected: null,
  };

  it('finds the gaps from the sentence written with its commas, and shows it without them', () => {
    const task = markTaskFrom(draft);
    expect(task?.key).toEqual([
      { at: 'g4', category: null },
      { at: 'g8', category: null },
    ]);
    expect(task!.words.map((w) => w.tail).join('')).not.toContain(',');
    expect(markSolution(task!)).toBe(draft.text);
    // Every gap is a target, the last word has none after it.
    expect(markTargets(task!)).toHaveLength(task!.words.length - 1);
  });

  it('a sentence without a comma to set, or with fields of another mode, is no task', () => {
    expect(markDraftProblem({ ...draft, text: 'Wir gehen heute nach Hause.' })).toBe('count');
    expect(
      markDraftProblem({ ...draft, targets: [{ word: 'Als', occurrence: null, category: null }] }),
    ).toBe('form');
    // A comma inside a word, or after the last one, is no place she could tap.
    expect(markDraftProblem({ ...draft, text: 'Wir kaufen Brot,Butter und Milch.' })).toBe('form');
    expect(markDraftProblem({ ...draft, text: 'Komm her, bitte schnell,' })).toBe('form');
  });
});

describe('syllables: the cuts between letters', () => {
  const draft: MarkDraft = {
    mode: 'syllables',
    text: 'Ba-na-ne Scho-ko-la-de Hund',
    targets: null,
    categories: null,
    corrected: null,
  };

  it('finds the cuts from the hyphens and shows the words whole', () => {
    const task = markTaskFrom(draft);
    expect(task?.words.map((w) => w.text)).toEqual(['Banane', 'Schokolade', 'Hund']);
    expect(task?.key.map((k) => k.at)).toEqual(['w1_2', 'w1_4', 'w2_4', 'w2_6', 'w2_8']);
    expect(markSolution(task!)).toBe('Ba-na-ne Scho-ko-la-de Hund');
  });

  it('refuses anything but letters, empty syllables, long words and too many words', () => {
    expect(markDraftProblem({ ...draft, text: 'Ba-na-ne 12' })).toBe('not_letters');
    expect(markDraftProblem({ ...draft, text: 'Ba--na-ne' })).toBe('not_letters');
    expect(markDraftProblem({ ...draft, text: 'Ba-na-ne-' })).toBe('not_letters');
    expect(markDraftProblem({ ...draft, text: 'Ver-ant-wor-tungs-be-wusst' })).toBe('too_long');
    expect(markDraftProblem({ ...draft, text: 'Ba-na-ne Ho-se Ta-sche Lö-we Ma-ma' })).toBe(
      'count',
    );
    expect(markDraftProblem({ ...draft, text: 'Hund Katz' })).toBe('count');
  });
});

describe('her marks against the key (no model)', () => {
  const task = markTaskFrom(
    words('Der Hund bellt den Postboten im Garten an.', [
      { word: 'Hund', occurrence: null, category: null },
      { word: 'Postboten', occurrence: null, category: null },
      { word: 'Garten', occurrence: null, category: null },
    ]),
  )!;

  it('counts right, missing and too many — and says so kindly', () => {
    const check = checkMark(task, {
      type: 'mark',
      marks: [
        { at: 'w2', category: null },
        { at: 'w5', category: null },
        { at: 'w3', category: null },
      ],
    });
    expect(check).toMatchObject({ correct: false, right: 2, missing: 1, extra: 1, misfiled: 0 });
    expect(markReply('de', check!)).toBe('Noch nicht ganz: 2 richtig, 1 fehlt noch, 1 zu viel.');
    expect(
      markAnswerText(task, {
        type: 'mark',
        marks: [
          { at: 'w2', category: null },
          { at: 'w3', category: null },
        ],
      }),
    ).toBe('Hund, bellt');
  });

  it('is right exactly when the set is the key', () => {
    const marks = task.key.map((k) => ({ ...k }));
    expect(checkMark(task, { type: 'mark', marks: [...marks].reverse() })?.correct).toBe(true);
    expect(checkMark(task, { type: 'mark', marks: [] })).toMatchObject({
      correct: false,
      missing: 3,
    });
  });

  it('refuses marks that do not fit the task (a place twice, one that is not there, a category it lacks)', () => {
    expect(
      checkMark(task, {
        type: 'mark',
        marks: [
          { at: 'w2', category: null },
          { at: 'w2', category: null },
        ],
      }),
    ).toBeNull();
    expect(checkMark(task, { type: 'mark', marks: [{ at: 'w99', category: null }] })).toBeNull();
    expect(checkMark(task, { type: 'mark', marks: [{ at: 'g1', category: null }] })).toBeNull();
    expect(checkMark(task, { type: 'mark', marks: [{ at: 'w2', category: 'k1' }] })).toBeNull();
  });

  it('with categories, a right place in the wrong category is named as such', () => {
    const sorted = markTaskFrom(
      words(
        'Der Hund bellt den Postboten an.',
        [
          { word: 'Hund', occurrence: null, category: 'Nomen' },
          { word: 'bellt', occurrence: null, category: 'Verb' },
          { word: 'Postboten', occurrence: null, category: 'Nomen' },
        ],
        { categories: ['Nomen', 'Verb'] },
      ),
    )!;
    const check = checkMark(sorted, {
      type: 'mark',
      marks: [
        { at: 'w2', category: 'k1' },
        { at: 'w3', category: 'k1' },
      ],
    });
    expect(check).toMatchObject({ right: 1, misfiled: 1, missing: 1, extra: 0 });
    expect(markReply('de', check!)).toBe(
      'Noch nicht ganz: 1 richtig, 1 mit der falschen Kategorie, 1 fehlt noch.',
    );
  });

  it('a stored task that no longer holds together is no task', () => {
    expect(markProblem({ ...task, key: [{ at: 'w42', category: null }] })).toBe('not_in_text');
    expect(markProblem({ ...task, key: [] })).toBe('count');
  });
});

describe('a marking task as a question', () => {
  it('becomes a structured item whose answer is the solution in words', () => {
    const item = structuredItem({
      type: 'mark',
      prompt: 'Tippe alle Nomen an.',
      mode: 'words',
      text: 'der hund spielt mit dem ball im garten.',
      targets: [
        { word: 'hund', occurrence: null, category: null },
        { word: 'ball', occurrence: null, category: null },
        { word: 'garten', occurrence: null, category: null },
      ],
      categories: null,
      corrected: null,
      topic: 'Nomen',
      difficulty: 2,
      prompt_lang: 'de',
      hints: ['Nomen kann man anfassen.', 'hund, ball, garten'],
    });
    expect(item?.kind).toBe('mark');
    expect(item?.answer).toBe('hund, ball, garten');
    // A hint that gives the whole answer away is dropped.
    expect(item?.hints).toEqual(['Nomen kann man anfassen.']);
    expect(viewOf(item!.task)).toMatchObject({ type: 'mark', mode: 'words' });
  });

  it('a hint that names one place to mark is dropped too — every target stands in the text', () => {
    const task = markTaskFrom(
      words('der hund spielt mit dem ball im garten.', [
        { word: 'hund', occurrence: null, category: null },
        { word: 'garten', occurrence: null, category: null },
      ]),
    )!;
    const prompt = 'Tippe alle Nomen an.';
    expect(namesAMark('Schau dir den Garten genau an.', task, prompt)).toBe(true);
    expect(namesAMark('Ein Nomen kann man anfassen.', task, prompt)).toBe(false);
    // Commas: the word a comma belongs after gives the place away; syllables: a cut word.
    const commas = markTaskFrom({ ...gaps, text: 'Ich glaube, dass es regnet.' })!;
    expect(namesAMark('Achte auf das Wort glaube.', commas, 'Setze die Kommas.')).toBe(true);
    const cut = markTaskFrom({ ...syl, text: 'Scho-ko-la-de' })!;
    expect(namesAMark('Es heißt Scho-ko-la-de.', cut, 'Trenne.')).toBe(true);
    expect(namesAMark('Klatsch das Wort beim Sprechen.', cut, 'Trenne.')).toBe(false);
  });

  it('the view the app gets has no key and no correction', () => {
    const task = markTaskFrom(
      words('Der Hunt bellt laut.', [{ word: 'Hunt', occurrence: null, category: null }], {
        corrected: 'Der Hund bellt laut.',
      }),
    )!;
    expect(JSON.stringify(markView(task))).not.toContain('Hund');
    expect(markView(task)).not.toHaveProperty('key');
  });
});

describe('a marking in a reading text (#234 with #233)', () => {
  const LINES = [
    'Mia wohnt mit ihrer Familie in einem kleinen Dorf.',
    'Jeden Morgen fährt sie mit dem Fahrrad zur Schule,',
    'die drei Kilometer entfernt im Nachbarort liegt.',
  ];
  const transcript = LINES.join(' ');
  const other: ReadingQuestion = {
    kind: 'short',
    prompt: 'Wo wohnt Mia?',
    answer: 'in einem Dorf',
    accepted_answers: [],
    evidence: 'in einem kleinen Dorf',
    difficulty: 1,
  };
  const mark = (q: Partial<Extract<ReadingQuestion, { kind: 'mark' }>>): ReadingQuestion => ({
    kind: 'mark',
    prompt: 'Tippe die Nomen im ersten Satz an.',
    mode: 'words',
    text: 'Mia wohnt mit ihrer Familie in einem kleinen Dorf.',
    targets: [
      { word: 'Familie', occurrence: null, category: null },
      { word: 'Dorf', occurrence: null, category: null },
    ],
    categories: null,
    corrected: null,
    difficulty: 1,
    ...q,
  });
  const read = (q: ReadingQuestion) =>
    readingItems(
      { title: null, lines: LINES, lang: 'de', topic: 'Mias Schulweg', questions: [other, q] },
      { locale: 'de', transcript },
    );

  it('marks in a sentence OF the text; that sentence is where she is shown it afterwards', () => {
    const items = read(mark({}));
    expect(items).toHaveLength(2);
    const marked = items[1]!;
    expect(marked.kind).toBe('mark');
    expect(marked.source_excerpt).toBe('Mia wohnt mit ihrer Familie in einem kleinen Dorf.');
    expect(marked.hints).toEqual(['Lies nochmal Zeile 1.']);
  });

  it('sets the commas of a sentence of the text, across a line break', () => {
    const items = read(
      mark({
        mode: 'gaps',
        prompt: 'Setze das Komma.',
        text: 'Jeden Morgen fährt sie mit dem Fahrrad zur Schule, die drei Kilometer entfernt im Nachbarort liegt.',
        targets: null,
      }),
    );
    expect(items[1]?.task?.type).toBe('mark');
  });

  it('a sentence that is not in the text, syllables or an error text is no reading question', () => {
    expect(read(mark({ text: 'Mia wohnt mit ihrem Hund in einem großen Dorf.' }))).toEqual([]);
    expect(
      read(mark({ mode: 'syllables', text: 'Fa-mi-lie', targets: null, prompt: 'Trenne.' })),
    ).toEqual([]);
    expect(
      read(
        mark({
          text: 'Mia wont mit ihrer Familie in einem kleinen Dorf.',
          targets: [{ word: 'wont', occurrence: null, category: null }],
          corrected: 'Mia wohnt mit ihrer Familie in einem kleinen Dorf.',
        }),
      ),
    ).toEqual([]);
  });
});
