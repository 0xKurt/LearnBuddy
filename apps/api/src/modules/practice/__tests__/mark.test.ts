// Markieren (issue #234): Regel 0 in both directions — what the model wrote, and what she marked.
// The acceptance list of the issue: tokenisation, a word that stands twice, comma gaps,
// syllables, the error text's correction — each rejection by its name.

import { describe, expect, it } from 'vitest';

import {
  checkMark,
  markAnswerText,
  markDraftProblem,
  markProblem,
  markReply,
  markSolution,
  markTargets,
  markTaskFrom,
  markView,
  splitWords,
  type MarkDraft,
} from '../mark.js';
import { structuredItem, viewOf } from '../structured.js';

const words = (text: string, targets: MarkDraft['targets'], more: Partial<MarkDraft> = {}) =>
  ({ mode: 'words', text, targets, categories: null, corrected: null, ...more }) as MarkDraft;

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
    ).toBe('Hund bellt');
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
});
